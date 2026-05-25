import json
import sys
import os
from datetime import datetime

# Ensure the script can find its sibling modules (risk_engine, compliance)
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

try:
    from risk_engine import derive_risks
    from compliance import posture, sync_catalog, heuristic_adherence_scan
    from database.models import list_risks
except ImportError as e:
    print(json.dumps({"error": f"Import Error: {str(e)}", "path": sys.path}))
    sys.exit(1)

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    # Handle MongoDB ObjectId
    try:
        from bson import ObjectId
        if isinstance(obj, ObjectId):
            return str(obj)
    except ImportError:
        pass
    # Fallback to string representation for anything else
    return str(obj)

def main():
    try:
        # Seed the compliance catalog if empty
        sync_catalog()
        
        # Check for framework argument
        framework = sys.argv[1] if len(sys.argv) > 1 else "CIS_V8"
        
        # Aggregate data from both engines
        # derive_risks() will now calculate and save real risks to MongoDB
        counts = derive_risks()
        compliance_data = posture(framework=framework)
        
        # Fetch the actual risk register from MongoDB (previously hardcoded)
        risk_register = list_risks()

        # Format risks summary for the cards
        formatted_risks = {}
        for key, count in counts.items():
            if key == "total": continue
            
            level = "Low" if count < 5 else "Medium" if count < 15 else "High"
            status = "Optimal" if count < 3 else "Vigilant" if count < 10 else "Warning"
            
            formatted_risks[f"{key}_risks" if not key.endswith("risks") else key] = {
                "count": count,
                "score": count * 5,
                "level": level,
                "status": status
            }

        # Calculate overall percentage
        implemented = [c for c in compliance_data if str(c.get('status', c.get('default_status', ''))).lower() == 'implemented']
        overall_pct = int((len(implemented) / len(compliance_data)) * 100) if compliance_data else 0

        # Real Heuristic Scan for Adherence
        adherence_results = heuristic_adherence_scan()

        final_output = {
            "timestamp": datetime.now().isoformat(),
            "risks_summary": formatted_risks,
            "risk_register": risk_register,
            "compliance": compliance_data,
            "overall_compliance_pct": overall_pct,
            "framework_adherence": adherence_results
        }

        # Output to stdout for Node.js to capture
        print(json.dumps(final_output, default=json_serial))
        
    except Exception as e:
        import traceback
        error_msg = f"GRC Bridge Runtime Error: {str(e)}\n{traceback.format_exc()}"
        print(json.dumps({"error": error_msg}))
        sys.exit(1)

if __name__ == "__main__":
    main()
