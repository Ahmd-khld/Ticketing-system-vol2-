"""
modules/risk_engine.py - MongoDB Refactored & Global Admin Integration

Auto-derives Risk Register entries from all Admin Modules in MongoDB.
"""

from __future__ import annotations
from typing import Optional
from database import db, models
from datetime import datetime, timedelta

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
        risk_id = f"RISK-RBAC-{str(email).replace('@', '-').replace('.', '-')}"
        models.upsert_auto_risk(
            id=risk_id, category="rbac",
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
    
    # 1. Detect high frequency of sensitive successful actions (CRUD on sensitive resources)
    pipeline_sensitive = [
        {"$match": {
            "status": "success",
            "action": {"$regex": "backup|delete|clear|block|restrict|provision|whitelist|banned", "$options": "i"}
        }},
        {"$group": {
            "_id": {"email": "$email", "action": "$action"},
            "hits": {"$sum": 1},
            "last_ip": {"$max": "$ipAddress"}
        }},
        {"$match": {"hits": {"$gte": 5}}} 
    ]
    
    # 2. Detect failed access attempts (Brute Force or Unauthorized access)
    pipeline_failed = [
        {"$match": {"status": "failed"}},
        {"$group": {
            "_id": {"email": "$email", "ip": "$ipAddress"},
            "fails": {"$sum": 1},
            "last_action": {"$max": "$action"}
        }},
        {"$match": {"fails": {"$gte": 3}}}
    ]

    # 3. Detect Multi-IP Anomaly (Admin session used from different IPs in short window)
    pipeline_ip_anomaly = [
        {"$group": {
            "_id": "$email",
            "unique_ips": {"$addToSet": "$ipAddress"},
            "count": {"$sum": 1}
        }},
        {"$project": {
            "email": "$_id",
            "ip_count": {"$size": "$unique_ips"},
            "ips": "$unique_ips"
        }},
        {"$match": {"ip_count": {"$gte": 3}}}
    ]

    # 4. Detect "Admin-on-Admin" or "Provisioning" Spikes
    pipeline_provisioning = [
        {"$match": {"action": {"$regex": "Provisioned new sub-admin|role", "$options": "i"}}},
        {"$group": {
            "_id": "$email",
            "provisions": {"$sum": 1}
        }},
        {"$match": {"provisions": {"$gte": 2}}} # Multiple admins created by same user
    ]
    
    # 5. Detect Rogue Admin: Excessive User Blocking
    pipeline_rogue_block = [
        {"$match": {"action": {"$regex": "Blocked: true", "$options": "i"}}},
        {"$group": {
            "_id": "$email",
            "blocks": {"$sum": 1}
        }},
        {"$match": {"blocks": {"$gte": 10}}} # Threshold of 10 blocks
    ]
    
    try:
        # Process sensitive action risks
        rows_sensitive = list(db['adminauditlogs'].aggregate(pipeline_sensitive))
        for r in rows_sensitive:
            _id_data = r.get("_id", {})
            email = _id_data.get("email", "unknown")
            action = _id_data.get("action", "unknown")
            hits = r.get("hits", 0)
            
            # Anti-forensics check
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

        # Process failed attempt risks
        rows_failed = list(db['adminauditlogs'].aggregate(pipeline_failed))
        for r in rows_failed:
            _id_data = r.get("_id", {})
            email = _id_data.get("email", "unknown")
            ip = _id_data.get("ip", "unknown")
            fails = r.get("fails", 0)
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

        # Process IP Anomaly risks
        rows_ip = list(db['adminauditlogs'].aggregate(pipeline_ip_anomaly))
        for r in rows_ip:
            email = r.get("email", "unknown")
            ips = r.get("ips", [])
            risk_id = f"RISK-AUDIT-IP-ANOMALY-{str(email).replace('@','-').replace('.','-')}"
            models.upsert_auto_risk(
                id=risk_id, category="Account",
                description=f"Admin account {email} accessed from {len(ips)} different IPs: {', '.join(ips[:3])}...",
                asset="Identity Service", likelihood=4, impact=5, status="Open",
                recommendations=[
                    {"title": "Verify Session Integrity", "body": "Check if this admin is using a VPN or if their credentials have been shared.", "priority": "high"},
                    {"title": "Revoke All Sessions", "body": f"Force logout for {email} on all devices.", "priority": "critical"}
                ]
            )
            out.append(risk_id)

        # Process Provisioning Spikes
        rows_prov = list(db['adminauditlogs'].aggregate(pipeline_provisioning))
        for r in rows_prov:
            email = r.get("_id", "unknown")
            count = r.get("provisions", 0)
            risk_id = f"RISK-AUDIT-PROV-{str(email).replace('@','-').replace('.','-')}"
            models.upsert_auto_risk(
                id=risk_id, category="rbac",
                description=f"Admin {email} has provisioned {count} new sub-admins in a short period. Possible rogue admin or account takeover.",
                asset="IAM Control Plane", likelihood=5, impact=5, status="Open",
                recommendations=[
                    {"title": "Audit Account Creation", "body": "Review the newly created sub-admin accounts for legitimacy.", "priority": "critical"},
                    {"title": "Restrict Provisioning Rights", "body": f"Temporarily remove 'Manage Sub-Admins' permission from {email}.", "priority": "high"}
                ]
            )
            out.append(risk_id)

        # Process Rogue Blocking
        rows_block = list(db['adminauditlogs'].aggregate(pipeline_rogue_block))
        for r in rows_block:
            email = r.get("_id", "unknown")
            count = r.get("blocks", 0)
            risk_id = f"RISK-ROGUE-BLOCK-{str(email).replace('@','-').replace('.','-')}"
            models.upsert_auto_risk(
                id=risk_id, category="rbac",
                description=f"Admin {email} has blocked {count} users. This exceeds the safety threshold and may indicate a rogue actor.",
                asset="User Management System", likelihood=5, impact=5, status="Open",
                recommendations=[
                    {"title": "Revoke Admin Controls", "body": f"Demote {email} to standard user role and revoke all system permissions immediately.", "priority": "critical", "action": "reset_permissions", "params": {"targetEmail": email}},
                    {"title": "Verify Blocking Intent", "body": "Review the reasons provided for these blocks to determine if they were legitimate.", "priority": "high"}
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
