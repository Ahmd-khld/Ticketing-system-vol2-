const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ComplianceControl = require('./models/ComplianceControl');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const CIS_V8_CONTROLS = [
  {
    controlId: 'CIS-1',
    framework: 'CIS_V8',
    category: 'Asset Management',
    name: 'Inventory and Control of Enterprise Assets',
    status: 'implemented',
    description: 'Maintain an accurate and up-to-date inventory of all enterprise assets.',
    evidence: 'Asset Register tab auto-populates machines table on every login.'
  },
  {
    controlId: 'CIS-2',
    framework: 'CIS_V8',
    category: 'Asset Management',
    name: 'Inventory and Control of Software Assets',
    status: 'not_implemented',
    description: 'Maintain an inventory of installed software and prevent unauthorized software execution.',
    evidence: 'Not in scope - the platform doesn\'t enumerate installed software.'
  },
  {
    controlId: 'CIS-3',
    framework: 'CIS_V8',
    category: 'Data Security',
    name: 'Data Protection',
    status: 'partial',
    description: 'Develop processes and technical controls to identify and protect data.',
    evidence: 'Audit log + risk register cover handling and retention awareness.'
  },
  {
    controlId: 'CIS-4',
    framework: 'CIS_V8',
    category: 'Configuration Management',
    name: 'Secure Configuration of Enterprise Assets and Software',
    status: 'partial',
    description: 'Establish and maintain secure configuration of enterprise assets.',
    evidence: 'System Integrity tab monitors SAM/SYSTEM/SECURITY hives.'
  },
  {
    controlId: 'CIS-5',
    framework: 'CIS_V8',
    category: 'Identity & Access',
    name: 'Account Management',
    status: 'implemented',
    description: 'Manage authorization to credentials for user accounts.',
    evidence: 'Admin tab manages user CRUD, role assignment, and 2FA status.'
  },
  {
    controlId: 'CIS-6',
    framework: 'CIS_V8',
    category: 'Identity & Access',
    name: 'Access Control Management',
    status: 'implemented',
    description: 'Use processes and tools to create and manage access credentials.',
    evidence: 'RBAC roles (admin/viewer) and automatic lockout after failed attempts.'
  },
  {
    controlId: 'CIS-7',
    framework: 'CIS_V8',
    category: 'Vulnerability Management',
    name: 'Continuous Vulnerability Management',
    status: 'partial',
    description: 'Continuously assess and track vulnerabilities on all enterprise assets.',
    evidence: 'Exposure analytics surfaces observed listening ports.'
  },
  {
    controlId: 'CIS-8',
    framework: 'CIS_V8',
    category: 'Logging & Monitoring',
    name: 'Audit Log Management',
    status: 'implemented',
    description: 'Collect, review, and retain audit logs of events.',
    evidence: 'Centralised audit_log table covers auth, IPS, file, and user events.'
  },
  {
    controlId: 'CIS-9',
    framework: 'CIS_V8',
    category: 'Endpoint Protection',
    name: 'Email and Web Browser Protections',
    status: 'not_implemented',
    description: 'Improve protections against threats from email and web vectors.',
    evidence: 'Out of scope - the platform is host-monitoring focused.'
  },
  {
    controlId: 'CIS-10',
    framework: 'CIS_V8',
    category: 'Endpoint Protection',
    name: 'Malware Defenses',
    status: 'implemented',
    description: 'Prevent or control the installation and spread of malicious code.',
    evidence: 'File Monitor tab + ML classifier + auto-remove option.'
  },
  {
    controlId: 'CIS-11',
    framework: 'CIS_V8',
    category: 'Resilience',
    name: 'Data Recovery',
    status: 'not_implemented',
    description: 'Establish and maintain data recovery practices.',
    evidence: 'Backup/restore not in scope.'
  },
  {
    controlId: 'CIS-12',
    framework: 'CIS_V8',
    category: 'Network Security',
    name: 'Network Infrastructure Management',
    status: 'partial',
    description: 'Manage network devices to prevent attacker exploitation.',
    evidence: 'Blocked IPs tab + Windows Firewall integration.'
  },
  {
    controlId: 'CIS-13',
    framework: 'CIS_V8',
    category: 'Network Security',
    name: 'Network Monitoring and Defense',
    status: 'implemented',
    description: 'Maintain comprehensive network monitoring and defense.',
    evidence: 'Network Monitor tab with live sniffer and ML classification.'
  },
  {
    controlId: 'CIS-14',
    framework: 'CIS_V8',
    category: 'Awareness',
    name: 'Security Awareness and Skills Training',
    status: 'not_implemented',
    description: 'Establish and maintain a security awareness program.',
    evidence: 'Out of scope - human/training control.'
  },
  {
    controlId: 'CIS-15',
    framework: 'CIS_V8',
    category: 'Third-party Risk',
    name: 'Service Provider Management',
    status: 'not_implemented',
    description: 'Evaluate service providers who hold sensitive data.',
    evidence: 'Out of scope.'
  },
  {
    controlId: 'CIS-16',
    framework: 'CIS_V8',
    category: 'Application Security',
    name: 'Application Software Security',
    status: 'not_implemented',
    description: 'Manage the security life cycle of in-house developed software.',
    evidence: 'Out of scope.'
  },
  {
    controlId: 'CIS-17',
    framework: 'CIS_V8',
    category: 'Incident Response',
    name: 'Incident Response Management',
    status: 'implemented',
    description: 'Develop and maintain an incident response capability.',
    evidence: 'Risk Register + Recommendations playbook = incident triage workflow.'
  },
  {
    controlId: 'CIS-18',
    framework: 'CIS_V8',
    category: 'Assurance',
    name: 'Penetration Testing',
    status: 'not_implemented',
    description: 'Test the effectiveness and resiliency of enterprise assets.',
    evidence: 'Out of scope.'
  }
];

async function seedCompliance() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected for seeding...');

    console.log('Cleaning existing compliance controls...');
    await ComplianceControl.deleteMany({});
    
    console.log('Seeding CIS v8 controls...');
    await ComplianceControl.insertMany(CIS_V8_CONTROLS);
    console.log('Successfully seeded 18 CIS v8 controls!');

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedCompliance();
