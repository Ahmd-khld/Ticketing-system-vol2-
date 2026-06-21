"""
modules/risk_engine.py - MongoDB Refactored & Global Admin Integration

Auto-derives Risk Register entries from all Admin Modules in MongoDB.
"""

from __future__ import annotations
from typing import Optional
from database import db, models
from datetime import datetime, timedelta
import os
import subprocess
import json
import collections
import re

SUPER_ADMIN_EMAIL = os.environ.get("VITE_SUPER_ADMIN_EMAIL", "admin@smartpark.com").lower()
ENCRYPTED_SUPER_ADMIN_EMAIL = os.environ.get("ENCRYPTED_SUPER_ADMIN_EMAIL", "").strip()
LEGACY_ENCRYPTED_SUPER_ADMIN_EMAIL = os.environ.get("LEGACY_ENCRYPTED_SUPER_ADMIN_EMAIL", "").strip()

def _is_super_admin(email: str) -> bool:
    e = str(email).strip()
    if e.lower() == SUPER_ADMIN_EMAIL.strip().lower(): return True
    if ENCRYPTED_SUPER_ADMIN_EMAIL and e == ENCRYPTED_SUPER_ADMIN_EMAIL: return True
    if LEGACY_ENCRYPTED_SUPER_ADMIN_EMAIL and e == LEGACY_ENCRYPTED_SUPER_ADMIN_EMAIL: return True
    return False

# -----------------------------------------------------------------------------
# Scoring helpers
# -----------------------------------------------------------------------------
_CRITICALITY_TO_IMPACT = {
    "low": 2, "medium": 3, "high": 4, "critical": 5,
}

def _impact_from_asset(asset_id: Optional[str], default: int = 3) -> int:
    if not asset_id:
        return default
    return default

def _likelihood_from_count(n: int, *, low: int = 1, mid: int = 5,
                           high: int = 20, top: int = 50) -> int:
    """Map an event count to a 1-5 likelihood band."""
    if n >= top: return 5
    if n >= high: return 4
    if n >= mid: return 3
    if n >= low: return 2
    return 1

# -----------------------------------------------------------------------------
# Recommendation playbook
# -----------------------------------------------------------------------------
_PLAYBOOK: dict[str, list[dict]] = {
    "network": [
        {"title": "Block Source IP", "body": "Add a firewall rule to block the offending IP.", "priority": "high", "action": "ban_ip"},
        {"title": "Enable Rate Limiting", "body": "Implement connection limits to prevent brute force.", "priority": "medium"}
    ],
    "malware": [
        {"title": "Quarantine File", "body": "Move the detected binary to a secure isolation folder.", "priority": "high"},
        {"title": "Run Full Scan", "body": "Trigger a deep EDR scan on the affected host.", "priority": "medium"}
    ],
    "integrity": [
        {"title": "Verify Hash", "body": "Manually check the system file hash against baseline.", "priority": "critical"},
        {"title": "Isolate Asset", "body": "Restrict network traffic until integrity is verified.", "priority": "high"}
    ],
    "account": [
        {"title": "Enforce TOTP", "body": "Force MFA enrollment for the user on next login.", "priority": "high"},
        {"title": "Reset Password", "body": "Force a password reset to mitigate credential leaks.", "priority": "medium"}
    ],
    "config": [
        {"title": "Assign Asset Owner", "body": "Determine stakeholder and update the asset register.", "priority": "medium"},
        {"title": "Review Access", "body": "Confirm only necessary users have access to this asset.", "priority": "low"}
    ],
    "rbac": [
        {"title": "Revoke critical permissions", "body": "Navigate to the Access Control matrix and uncheck 'Hardware Control' and 'System Settings' for this user.", "priority": "critical", "action": "reset_permissions"},
        {"title": "Audit account activity", "body": "Check the Admin Audit Logs to see if this user has abused these elevated permissions recently.", "priority": "high"}
    ],
    "resilience": [
        {"title": "Perform Manual Backup", "body": "Execute an immediate database backup via the Backups module.", "priority": "high"},
        {"title": "Verify Backup Schedule", "body": "Check cron logs to ensure automatic backups are triggering.", "priority": "medium"}
    ],
    "operational": [
        {"title": "Clear Test Backlog", "body": "Archive all auto-generated test tickets.", "priority": "medium", "action": "clear_backlog"},
        {"title": "Prioritize Urgent Tickets", "body": "Filter tickets by status='pending' and category='technical' to address critical issues.", "priority": "high"}
    ]
}

def _get_recommendations(category: str, params: dict = {}) -> list[dict]:
    recs = _PLAYBOOK.get(category.lower(), _PLAYBOOK.get("operational"))
    # Add context-specific params to actions
    out = []
    for r in recs:
        new_r = r.copy()
        if 'action' in new_r:
            new_r['params'] = params
        out.append(new_r)
    return out

# -----------------------------------------------------------------------------
# Global Derivers
# -----------------------------------------------------------------------------

def _derive_network_risks() -> list[str]:
    out = []
    pipeline = [
        {"$match": {"attack_type": {"$ne": "Normal"}}},
        {"$group": {
            "_id": "$src_ip",
            "hits": {"$sum": 1},
            "distinct_types": {"$addToSet": "$attack_type"},
            "last_seen": {"$max": "$timestamp"}
        }},
        {"$match": {"hits": {"$gte": 3}}},
        {"$sort": {"hits": -1}},
        {"$limit": 50}
    ]
    try:
        rows = list(db['network_alerts'].aggregate(pipeline))
    except Exception: return out
    for r in rows:
        src_ip = r.get("_id", "unknown")
        hits = r.get("hits", 0)
        risk_id = f"RISK-NET-{str(src_ip).replace('.', '-')}"
        models.upsert_auto_risk(
            id=risk_id, category="Network",
            description=f"{hits} alert(s) from {src_ip}. Last seen: {r.get('last_seen')}.",
            asset=f"IP: {src_ip}", likelihood=_likelihood_from_count(hits, low=3, mid=10, high=30),
            impact=4, status="Open", recommendations=_get_recommendations("network", {"ip": src_ip})
        )
        out.append(risk_id)
    return out

def _derive_malware_risks() -> list[str]:
    out = []
    pipeline = [
        {"$match": {"is_malware": 1}},
        {"$group": {
            "_id": "$hostname",
            "hits": {"$sum": 1},
            "last_seen": {"$max": "$timestamp"},
            "sample_path": {"$max": "$file_path"}
        }},
        {"$sort": {"hits": -1}}
    ]
    try:
        rows = list(db['malware_alerts'].aggregate(pipeline))
    except Exception: return out
    for r in rows:
        host = r.get("_id", "unknown")
        hits = r.get("hits", 0)
        risk_id = f"RISK-MAL-{str(host).replace('.', '-')}"
        models.upsert_auto_risk(
            id=risk_id, category="Malware",
            description=f"{hits} detection(s) on {host}. Path: {r.get('sample_path')}.",
            asset=host, likelihood=_likelihood_from_count(hits, low=1, mid=3, high=10),
            impact=5, status="Open", recommendations=_get_recommendations("malware")
        )
        out.append(risk_id)
    return out

def _derive_integrity_risks() -> list[str]:
    """One risk per file in 'mismatch' state."""
    out = []
    try:
        rows = list(db['integrity_baseline'].find({"last_status": "mismatch"}))
    except Exception: return out
    for r in rows:
        path = r.get("file_path", "unknown")
        impact = 5 if "SAM" in str(path).upper() or "SYSTEM" in str(path).upper() else 4
        risk_id = f"RISK-INT-{str(path).replace('\\', '-').replace('/', '-')}"
        models.upsert_auto_risk(
            id=risk_id, category="Integrity",
            description=f"Integrity baseline mismatch for {path}.",
            asset=path, likelihood=5, impact=impact,
            status="Open", recommendations=_get_recommendations("integrity")
        )
        out.append(risk_id)
    return out

def _derive_account_risks() -> list[str]:
    out = []
    try:
        rows = list(db['users'].find({"role": {"$in": ["admin", "sub-admin"]}}))
    except Exception: return out
    for r in rows:
        email = r.get("email", "unknown")
        if _is_super_admin(email): continue
        is_verified = r.get("isVerified", False)
        if not is_verified:
            risk_id = f"RISK-ACC-{str(email).replace('@', '-').replace('.', '-')}"
            models.upsert_auto_risk(
                id=risk_id, category="Account",
                description=f"Administrative user '{email}' is not verified.",
                asset="IAM Service", likelihood=4, impact=5,
                status="Open", recommendations=_get_recommendations("account", {"email": email})
            )
            out.append(risk_id)
    return out

def _derive_hardware_risks() -> list[str]:
    out = []
    pipeline = [
        {"$match": {"type": {"$in": ["error", "action"]}}},
        {"$group": {
            "_id": "$sensor",
            "hits": {"$sum": 1},
            "last_msg": {"$max": "$message"}
        }},
        {"$match": {"hits": {"$gte": 5}}}
    ]
    try:
        rows = list(db['hardwarealerts'].aggregate(pipeline))
    except Exception: return out
    for r in rows:
        sensor = r.get("_id", "unknown")
        hits = r.get("hits", 0)
        risk_id = f"RISK-HW-{str(sensor).replace(' ', '-')}"
        models.upsert_auto_risk(
            id=risk_id, category="Integrity",
            description=f"Sensor '{sensor}' reporting frequent errors ({hits} hits). Latest: {r.get('last_msg')}",
            asset=sensor, likelihood=_likelihood_from_count(hits, low=5, mid=20, high=50),
            impact=4, status="Open", 
            recommendations=[{"title": "Inspect Hardware", "body": f"Check physical connections for {sensor}.", "priority": "high"}]
        )
        out.append(risk_id)
    return out

def _derive_rbac_risks() -> list[str]:
    out = []
    try:
        query = {
            "role": {"$in": ["user", "customer", "viewer"]},
            "$or": [
                {"permissions.hardwareControl": True},
                {"permissions.systemSettings": True},
                {"permissions.auditLogs": True}
            ]
        }
        rows = list(db['users'].find(query))
    except Exception: return out
    for r in rows:
        email = r.get("email", "unknown")
        if str(email).strip().lower() == SUPER_ADMIN_EMAIL.strip().lower(): continue
        risk_id = f"RISK-INSIDER-{str(email).replace('@', '-').replace('.', '-')}"
        models.upsert_auto_risk(
            id=risk_id, category="Account",
            description=f"User '{email}' has unauthorized elevated permissions.",
            asset="Access Control System", likelihood=5, impact=5,
            status="Open", recommendations=_get_recommendations("rbac", {"targetEmail": email})
        )
        out.append(risk_id)
    return out

def _derive_backup_risks() -> list[str]:
    """Check for missing or stale backups."""
    out = []
    try:
        # Check last backup date
        last_backup = db['backups'].find_one(sort=[("createdAt", -1)])
        if not last_backup:
            # Fallback to 'date' field if createdAt doesn't exist
            last_backup = db['backups'].find_one(sort=[("date", -1)])
            
        if not last_backup:
            risk_id = "RISK-BKUP-NONE"
            models.upsert_auto_risk(
                id=risk_id, category="Config",
                description="No system backups found in MongoDB. High risk of data loss.",
                asset="Database", likelihood=5, impact=5, status="Open",
                recommendations=_get_recommendations("resilience")
            )
            out.append(risk_id)
        else:
            # If older than 7 days
            last_date = last_backup.get('createdAt') or last_backup.get('date')
            if isinstance(last_date, datetime) and last_date < datetime.now() - timedelta(days=7):
                risk_id = "RISK-BKUP-STALE"
                models.upsert_auto_risk(
                    id=risk_id, category="Config",
                    description=f"Last system backup was on {last_date.date()}. Backups are stale (>7 days).",
                    asset="Database", likelihood=4, impact=4, status="Open",
                    recommendations=_get_recommendations("resilience")
                )
                out.append(risk_id)
    except Exception: pass
    return out

def _derive_operational_risks() -> list[str]:
    """Check for high volumes of pending tickets and excessive cash purchases."""
    out = []
    try:
        # 1. Check for pending ticket backlog
        pending_count = db['tickets'].count_documents({"status": "INACTIVE"})
        if pending_count >= 15:
            risk_id = "RISK-OPS-TICKETS"
            models.upsert_auto_risk(
                id=risk_id, category="Config",
                description=f"High volume of pending/inactive tickets ({pending_count}). Possible maintenance backlog.",
                asset="Operations", likelihood=3, impact=3, status="Open",
                recommendations=_get_recommendations("operational")
            )
            out.append(risk_id)

        # 2. NEW: Detect accounts with > 20 cash purchases
        pipeline_cash = [
            {"$match": {"paymentMethod": "CASH"}},
            {"$group": {
                "_id": "$userId",
                "cash_purchases": {"$sum": 1}
            }},
            {"$match": {"cash_purchases": {"$gt": 20}}}
        ]
        
        cash_rows = list(db['tickets'].aggregate(pipeline_cash))
        for r in cash_rows:
            user_id = str(r["_id"])
            count = r["cash_purchases"]
            
            # Fetch user email for better reporting
            user_doc = db['users'].find_one({"_id": r["_id"]}, {"email": 1})
            email = user_doc.get("email", "unknown") if user_doc else "unknown"
            
            risk_id = f"RISK-CASH-EXCESS-{user_id}"
            models.upsert_auto_risk(
                id=risk_id, category="Operational",
                description=f"User {email} has purchased {count} tickets via CASH. This exceeds the safety threshold of 20.",
                asset="Financial Integrity", likelihood=_likelihood_from_count(count, low=20, mid=30, high=50),
                impact=4, status="Open",
                recommendations=[
                    {"title": "Audit Purchase History", "body": f"Review all cash transactions for user {email}.", "priority": "high"},
                    {"title": "Flag for AML Review", "body": "Report this pattern to the finance team for Anti-Money Laundering investigation.", "priority": "critical"},
                    {"title": "Restrict Cash Payments", "body": f"Manually disable the CASH option for user {email}'s future bookings.", "priority": "medium"}
                ]
            )
            out.append(risk_id)

    except Exception as e:
        print(f"Operational Risk derivation error: {str(e)}")
    return out

def _derive_auth_risks() -> list[str]:
    """Check for high failed OTP volumes."""
    out = []
    pipeline = [
        {"$match": {"isVerified": False, "otpAttempts": {"$gte": 5}}},
        {"$group": {"_id": "$email", "fails": {"$max": "$otpAttempts"}}}
    ]
    try:
        rows = list(db['users'].aggregate(pipeline))
    except Exception: return out
    for r in rows:
        email = r["_id"]
        if str(email).strip().lower() == SUPER_ADMIN_EMAIL.strip().lower(): continue
        fails = r["fails"]
        risk_id = f"RISK-AUTH-{str(email).replace('@','-').replace('.','-')}"
        models.upsert_auto_risk(
            id=risk_id, category="Account",
            description=f"User {email} has {fails} failed OTP attempts. Possible brute force.",
            asset="Auth Service", likelihood=4, impact=4, status="Open",
            recommendations=_get_recommendations("account", {"email": email})
        )
        out.append(risk_id)
    return out

def _derive_config_risks() -> list[str]:
    """High-criticality assets without an owner."""
    out = []
    try:
        rows = list(db['machines'].find({
            "owner": {"$in": [None, "", " "]},
            "criticality": {"$in": ["high", "critical"]}
        }))
    except Exception: return out
    for r in rows:
        host = r.get("hostname", "unknown")
        impact = _CRITICALITY_TO_IMPACT.get(r.get("criticality"), 3)
        risk_id = f"RISK-CFG-{str(host).replace('.', '-')}"
        models.upsert_auto_risk(
            id=risk_id, category="Config",
            description=f"Critical asset '{host}' has no owner assigned.",
            asset=host, likelihood=3, impact=impact,
            status="Open", recommendations=_get_recommendations("config")
        )
        out.append(risk_id)
    return out

def _derive_audit_risks() -> list[str]:
    """Detect suspicious admin activity volume and pattern anomalies."""
    out = []
    try:
        raw_logs = list(db['adminauditlogs'].find({}))
        if not raw_logs:
            return out

        all_emails = list(set([r.get("email", "") for r in raw_logs if r.get("email")]))
        decrypted_map = {}
        
        if all_emails:
            try:
                proc = subprocess.run(
                    ['node', 'utils/batch_decrypt.js'],
                    input=json.dumps(all_emails).encode('utf-8'),
                    stdout=subprocess.PIPE,
                    check=True
                )
                decrypted_map = json.loads(proc.stdout.decode('utf-8'))
            except Exception as e:
                print("Batch decryption failed:", e)

        sensitive_re = re.compile(r"backup|delete|clear|whitelist|banned", re.I)
        prov_re = re.compile(r"Provisioned new sub-admin|role", re.I)
        insider_re = re.compile(r"Restricted user:", re.I)

        # 1. Sensitive: email, action
        sensitive_groups = collections.defaultdict(lambda: {"hits": 0, "last_ip": ""})
        # 2. Failed: email, ip
        failed_groups = collections.defaultdict(lambda: {"fails": 0, "last_action": ""})
        # 3. IP Anomaly: email
        ip_groups = collections.defaultdict(set)
        # 4. Provisioning: email
        prov_groups = collections.defaultdict(int)
        # 5. Insider Sabotage: email
        insider_groups = collections.defaultdict(int)

        for r in raw_logs:
            raw_email = r.get("email", "")
            email = decrypted_map.get(raw_email, raw_email)
            action = r.get("action", "")
            ip = r.get("ipAddress", "")
            status = r.get("status", "")

            # 1. Sensitive
            if status == "success" and sensitive_re.search(action):
                sensitive_groups[(email, action)]["hits"] += 1
                if ip: sensitive_groups[(email, action)]["last_ip"] = ip
            
            # 2. Failed
            if status == "failed":
                failed_groups[(email, ip)]["fails"] += 1
                failed_groups[(email, ip)]["last_action"] = max(failed_groups[(email, ip)]["last_action"], action)
            
            # 3. IP Anomaly
            if ip:
                ip_groups[email].add(ip)
            
            # 4. Provisioning
            if prov_re.search(action):
                prov_groups[email] += 1
                
            # 5. Insider Sabotage
            if insider_re.search(action):
                insider_groups[email] += 1

        # Evaluate Sensitive
        for (email, action), data in sensitive_groups.items():
            if _is_super_admin(email): continue
            hits = data["hits"]
            if hits >= 5:
                is_anti_forensic = "clear" in str(action).lower() or "audit" in str(action).lower()
                risk_id = f"RISK-AUDIT-{'AF' if is_anti_forensic else 'SENSITIVE'}-{str(email).replace('@','-').replace('.','-')}"
                models.upsert_auto_risk(
                    id=risk_id, category="Account",
                    description=f"{'Anti-Forensic Activity' if is_anti_forensic else 'High sensitive action frequency'} from {email}. Hits: {hits}. Action: {action}",
                    asset="Admin Console", likelihood=_likelihood_from_count(hits, low=1, mid=5, high=10),
                    impact=5, status="Open",
                    recommendations=[
                        {"title": "Immediate Identity Verification", "body": f"The account {email} is performing highly sensitive actions. Verify physical identity.", "priority": "critical"},
                        {"title": "Review Action Chain", "body": "Analyze the chronological sequence of these logs for suspicious intent.", "priority": "high"}
                    ]
                )
                out.append(risk_id)

        # Evaluate Failed
        for (email, ip), data in failed_groups.items():
            if _is_super_admin(email): continue
            fails = data["fails"]
            if fails >= 3:
                risk_id = f"RISK-AUDIT-FAIL-{str(email).replace('@','-').replace('.','-')}"
                models.upsert_auto_risk(
                    id=risk_id, category="Account",
                    description=f"Multiple failed admin actions ({fails}) detected from {email} at IP {ip}. Possible unauthorized access attempt.",
                    asset="Security Layer", likelihood=_likelihood_from_count(fails, low=3, mid=5, high=10),
                    impact=5, status="Open",
                    recommendations=[
                        {"title": "Ban IP Address", "body": f"Manually blacklist IP {ip} in the Network Security module.", "priority": "critical", "action": "ban_ip", "params": {"ip": ip}},
                        {"title": "Lock Account", "body": f"Temporarily disable {email} until password is reset.", "priority": "high"}
                    ]
                )
                out.append(risk_id)

        # Evaluate IP Anomaly
        for email, ips in ip_groups.items():
            if _is_super_admin(email): continue
            if len(ips) >= 3:
                risk_id = f"RISK-AUDIT-IP-ANOMALY-{str(email).replace('@','-').replace('.','-')}"
                models.upsert_auto_risk(
                    id=risk_id, category="Account",
                    description=f"Admin account {email} accessed from {len(ips)} different IPs: {', '.join(list(ips)[:3])}...",
                    asset="Identity Service", likelihood=4, impact=5, status="Open",
                    recommendations=[
                        {"title": "Verify Session Integrity", "body": "Check if this admin is using a VPN or if their credentials have been shared.", "priority": "high"},
                        {"title": "Revoke All Sessions", "body": f"Force logout for {email} on all devices.", "priority": "critical"}
                    ]
                )
                out.append(risk_id)

        # Evaluate Provisioning
        for email, count in prov_groups.items():
            if _is_super_admin(email): continue
            if count >= 2:
                risk_id = f"RISK-AUDIT-PROV-{str(email).replace('@','-').replace('.','-')}"
                models.upsert_auto_risk(
                    id=risk_id, category="Account",
                    description=f"Admin {email} has provisioned {count} new sub-admins in a short period. Possible rogue admin or account takeover.",
                    asset="IAM Control Plane", likelihood=5, impact=5, status="Open",
                    recommendations=[
                        {"title": "Audit Account Creation", "body": "Review the newly created sub-admin accounts for legitimacy.", "priority": "critical"},
                        {"title": "Restrict Provisioning Rights", "body": f"Temporarily remove 'Manage Sub-Admins' permission from {email}.", "priority": "high"}
                    ]
                )
                out.append(risk_id)

        # Evaluate Insider Sabotage
        for email, count in insider_groups.items():
            if _is_super_admin(email): continue
            if count > 5:
                risk_id = f"RISK-INSIDER-{str(email).replace('@','-').replace('.','-')}"
                models.upsert_auto_risk(
                    id=risk_id, category="Account",
                    description=f"Admin {email} has restricted {count} users recently. Potential insider abuse detected.",
                    asset="User Management System", likelihood=5, impact=5, status="Open",
                    recommendations=[
                        {"title": "Suspend Admin Account", "body": f"Temporarily lock out {email} to halt all administrative capabilities and prevent further damage.", "priority": "critical", "action": "RESOLVE_INSIDER_THREAT", "params": {"adminEmail": email}},
                        {"title": "Audit & Unblock Victims", "body": "Review the audit logs to identify and rapidly restore access to the unjustly restricted users.", "priority": "high"}
                    ]
                )
                out.append(risk_id)

    except Exception as e:
        print(f"Audit Risk derivation error: {str(e)}")
        return out

    return out

# -----------------------------------------------------------------------------
# Public entry
# -----------------------------------------------------------------------------
def derive_risks() -> dict:
    res = {
        "network": len(_derive_network_risks()),
        "malware": len(_derive_malware_risks()),
        "integrity": len(_derive_integrity_risks()) + len(_derive_hardware_risks()),
        "account": len(_derive_account_risks()) + len(_derive_rbac_risks()) + len(_derive_auth_risks()) + len(_derive_audit_risks()),
        "config": len(_derive_config_risks()) + len(_derive_backup_risks()) + len(_derive_operational_risks()),
    }
    res["total"] = sum(res.values())
    return res
