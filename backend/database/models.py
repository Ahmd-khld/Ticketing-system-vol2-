# Real models module interacting with MongoDB
from .db import db
from datetime import datetime

# Collection handles
alerts_coll = db['hardwarealerts']
users_coll = db['users']
compliance_coll = db['compliancecontrols']
risks_coll = db['risks']
tickets_coll = db['tickets']
promos_coll = db['promocodes']
backups_coll = db['backups']
otps_coll = db['otps']
whitelist_coll = db['whitelistedips']
audit_coll = db['adminauditlogs']
banned_coll = db['bannedips']

def get_all_hardware_alerts():
    return list(alerts_coll.find({}, {"_id": 0}))

def get_recent_audit_logs(limit=100):
    return list(audit_coll.find().sort("createdAt", -1).limit(limit))

def get_banned_ips():
    return list(banned_coll.find({}, {"_id": 0}))

def get_all_users():
    return list(users_coll.find({}, {"password": 0, "_id": 0}))

def get_all_tickets():
    return list(tickets_coll.find({}, {"_id": 0}))

def get_all_promos():
    return list(promos_coll.find({}, {"_id": 0}))

def get_all_backups():
    return list(backups_coll.find({}, {"_id": 0}))

def get_all_otps():
    return list(otps_coll.find({}, {"_id": 0}))

def get_all_whitelisted_ips():
    return list(whitelist_coll.find({}, {"_id": 0}))

def upsert_compliance_control(**kwargs):
    """
    Upserts a compliance control status.
    Expected keys: controlId, framework, status, category, title, description, evidence
    """
    control_id = kwargs.get('controlId') or kwargs.get('control_id')
    framework = kwargs.get('framework', 'CIS_V8')
    
    if not control_id:
        return None
        
    query = {"controlId": control_id, "framework": framework}
    # Ensure controlId is used in the document
    kwargs['controlId'] = control_id
    if 'control_id' in kwargs: del kwargs['control_id']
    
    update = {"$set": kwargs}
    
    result = compliance_coll.update_one(query, update, upsert=True)
    return result.upserted_id or control_id

def compliance_summary(framework='CIS_V8'):
    """Returns a summary count of controls by status."""
    pipeline = [
        {"$match": {"framework": framework}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    results = list(compliance_coll.aggregate(pipeline))
    return {r['_id']: r['count'] for r in results}

def list_compliance_controls(framework='CIS_V8', status=None):
    query = {}
    if framework:
        query["framework"] = framework
    if status:
        query["status"] = status
    return list(compliance_coll.find(query, {"_id": 0}))

def upsert_auto_risk(**kwargs):
    """
    Upserts a risk derived by the engine.
    Expected keys: id, category, description, asset, likelihood, impact, status, recommendations
    Ensures 'Resolved' risks are not overwritten back to 'Open'.
    """
    risk_id = kwargs.get('id') or kwargs.get('risk_id')
    if not risk_id:
        return None
        
    query = {"id": risk_id}
    # Ensure id is in the set
    kwargs['id'] = risk_id
    
    # CRITICAL: Check if risk already exists and is Resolved
    existing = risks_coll.find_one(query)
    if existing and existing.get('status') == 'Resolved':
        # Preserve Resolved status, but update other fields (description, recommendations, etc.)
        kwargs['status'] = 'Resolved'
        if 'resolvedAt' not in kwargs and 'resolvedAt' in existing:
            kwargs['resolvedAt'] = existing['resolvedAt']
        if 'resolvedBy' not in kwargs and 'resolvedBy' in existing:
            kwargs['resolvedBy'] = existing['resolvedBy']

    update = {"$set": kwargs}
    
    result = risks_coll.update_one(query, update, upsert=True)
    return result.upserted_id or risk_id

def list_risks():
    return list(risks_coll.find({}, {"_id": 0}))

# Mock/Bridge functions for risk_engine logic if they don't have real collections yet
def get_all_network_alerts():
    return list(db['network_alerts'].find({}, {"_id": 0}))

def get_all_malware_signals():
    return list(db['malware_signals'].find({}, {"_id": 0}))

def get_all_integrity_signals():
    return list(db['integrity_signals'].find({}, {"_id": 0}))

def get_all_ueba_signals():
    return list(db['ueba_signals'].find({}, {"_id": 0}))

def get_all_exposure_signals():
    return list(db['exposure_signals'].find({}, {"_id": 0}))
