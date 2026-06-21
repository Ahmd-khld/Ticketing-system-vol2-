import subprocess
import json
import collections
import re
from database import models
from database.models import db

SUPER_ADMIN_EMAIL = "admin@smartpark.com"

def _is_super_admin(email: str) -> bool:
    import risk_engine
    return risk_engine._is_super_admin(email)

def _likelihood_from_count(c, low, mid, high):
    if c >= high: return 5
    if c >= mid: return 4
    if c >= low: return 3
    return 2

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

        sensitive_re = re.compile(r"backup|delete|clear|block|restrict|provision|whitelist|banned", re.I)
        prov_re = re.compile(r"Provisioned new sub-admin|role", re.I)
        block_re = re.compile(r"Blocked: true", re.I)

        # 1. Sensitive: email, action
        sensitive_groups = collections.defaultdict(lambda: {"hits": 0, "last_ip": ""})
        # 2. Failed: email, ip
        failed_groups = collections.defaultdict(lambda: {"fails": 0, "last_action": ""})
        # 3. IP Anomaly: email
        ip_groups = collections.defaultdict(set)
        # 4. Provisioning: email
        prov_groups = collections.defaultdict(int)
        # 5. Rogue Block: email
        block_groups = collections.defaultdict(int)

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
                
            # 5. Rogue Block
            if block_re.search(action):
                block_groups[email] += 1

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
                    id=risk_id, category="rbac",
                    description=f"Admin {email} has provisioned {count} new sub-admins in a short period. Possible rogue admin or account takeover.",
                    asset="IAM Control Plane", likelihood=5, impact=5, status="Open",
                    recommendations=[
                        {"title": "Audit Account Creation", "body": "Review the newly created sub-admin accounts for legitimacy.", "priority": "critical"},
                        {"title": "Restrict Provisioning Rights", "body": f"Temporarily remove 'Manage Sub-Admins' permission from {email}.", "priority": "high"}
                    ]
                )
                out.append(risk_id)

        # Evaluate Rogue Block
        for email, count in block_groups.items():
            if _is_super_admin(email): continue
            if count >= 10:
                risk_id = f"RISK-ROGUE-BLOCK-{str(email).replace('@','-').replace('.','-')}"
                models.upsert_auto_risk(
                    id=risk_id, category="rbac",
                    description=f"Admin {email} has blocked {count} users. This exceeds the safety threshold and may indicate a rogue actor.",
                    asset="User Management System", likelihood=5, impact=5, status="Open",
                    recommendations=[
                        {"title": "Suspend Admin Account", "body": f"Temporarily lock out {email} to halt all administrative capabilities and prevent further damage.", "priority": "critical", "action": "reset_permissions", "params": {"targetEmail": email}},
                        {"title": "Audit & Unblock Victims", "body": "Review the audit logs to identify and rapidly restore access to the unjustly blocked users.", "priority": "high"},
                        {"title": "Mandatory Security Debrief", "body": "Require the admin to explain the mass-blocking event before restoring any privileges.", "priority": "medium"}
                    ]
                )
                out.append(risk_id)

    except Exception as e:
        print(f"Audit Risk derivation error: {str(e)}")
        return out

    return out
