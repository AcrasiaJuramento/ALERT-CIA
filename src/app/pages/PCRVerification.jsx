import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, ChevronDown, Eye, CheckCircle2, XCircle,
  Clock, AlertTriangle, FileText, User, MapPin, Calendar,
  Activity, Heart, Thermometer, Wind, Droplets, X, MessageSquare
} from 'lucide-react';
import { pcrReports } from '../data/mockData';
import { toast } from 'sonner';

export default function PCRVerification() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [selectedPCR, setSelectedPCR] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const filteredReports = pcrReports.filter(report => {
    const matchesSearch =
      report.responseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.incidentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.placeOfIncident.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleVerify = (pcrId) => {
    toast.success(`PCR Report ${pcrId} has been verified successfully`, {
      description: 'The operation officer has been notified.',
    });
    setSelectedPCR(null);
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    toast.warning(`PCR Report ${selectedPCR?.id} has been rejected`, {
      description: 'The operation officer will be notified to make corrections.',
    });
    setShowRejectModal(false);
    setRejectionReason('');
    setSelectedPCR(null);
  };

  const statusColors = {
    submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    verified: 'bg-green-500/10 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  const statusIcons = {
    submitted: Clock,
    verified: CheckCircle2,
    rejected: XCircle,
  };

  return (
    <div className="p-5 space-y-5 min-h-full bg-background transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            PCR Verification
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">Review and verify patient care reports</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filteredReports.filter(r => r.status === 'submitted').length} pending verification
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by response number, incident ID, patient name, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-input-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-blue-500 transition-all"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-input-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500 transition-all"
          >
            <option value="all">All Status</option>
            <option value="submitted">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Pending Review', count: pcrReports.filter(r => r.status === 'submitted').length, color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Clock },
          { label: 'Verified', count: pcrReports.filter(r => r.status === 'verified').length, color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 },
          { label: 'Rejected', count: pcrReports.filter(r => r.status === 'rejected').length, color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
        ].map(({ label, count, color, bg, icon: Icon }) => (
          <div key={label} className={`p-4 rounded-xl border border-border ${bg} bg-card transition-colors duration-300`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className={`text-2xl font-bold ${color} mt-1`}>{count}</p>
              </div>
              <Icon className={`w-8 h-8 ${color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* PCR Reports Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden transition-colors duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Response #</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Incident ID</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Patient Name</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Location</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Date & Time</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Submitted By</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => {
                const StatusIcon = statusIcons[report.status] || Clock;
                return (
                  <tr
                    key={report.id}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-all cursor-pointer"
                    onClick={() => setSelectedPCR(report)}
                  >
                    <td className="px-4 py-3 font-mono text-blue-400">{report.responseNumber}</td>
                    <td className="px-3 py-3 text-foreground/80">{report.incidentId}</td>
                    <td className="px-3 py-3 text-foreground/80">{report.patientName}</td>
                    <td className="px-3 py-3 text-muted-foreground max-w-48 truncate">{report.placeOfIncident}</td>
                    <td className="px-3 py-3 text-muted-foreground">{report.dateOfIncident} {report.timeOfIncident}</td>
                    <td className="px-3 py-3 text-muted-foreground">{report.submittedBy || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold border ${statusColors[report.status]}`}>
                        <StatusIcon className="w-3 h-3" />
                        {report.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button className="text-blue-400 hover:text-blue-300 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredReports.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground">No PCR reports found</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedPCR && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPCR(null)}>
          <div
            className="bg-card border border-border rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">PCR Report Details</h2>
                <p className="text-xs text-muted-foreground">{selectedPCR.responseNumber}</p>
              </div>
              <button onClick={() => setSelectedPCR(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Status Badge */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border ${statusColors[selectedPCR.status]}`}>
                  {(() => {
                    const StatusIcon = statusIcons[selectedPCR.status];
                    return <StatusIcon className="w-4 h-4" />;
                  })()}
                  {selectedPCR.status.toUpperCase()}
                </span>
                {selectedPCR.submittedAt && (
                  <span className="text-xs text-muted-foreground">Submitted: {selectedPCR.submittedAt}</span>
                )}
              </div>

              {/* Rejection Reason */}
              {selectedPCR.status === 'rejected' && selectedPCR.rejectionReason && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-400">Rejection Reason</p>
                      <p className="text-xs text-red-300 mt-1">{selectedPCR.rejectionReason}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Responding Unit Details */}
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  RESPONDING UNIT DETAILS
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Team</p>
                    <p className="text-sm text-foreground">{selectedPCR.respondingTeam}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Vehicle</p>
                    <p className="text-sm text-foreground">{selectedPCR.vehicle}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Driver</p>
                    <p className="text-sm text-foreground">{selectedPCR.driver}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Main Aider</p>
                    <p className="text-sm text-foreground">{selectedPCR.mainAider}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Assistant</p>
                    <p className="text-sm text-foreground">{selectedPCR.assistantAider}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Incident ID</p>
                    <p className="text-sm text-blue-400">{selectedPCR.incidentId}</p>
                  </div>
                </div>
              </div>

              {/* Incident Details */}
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  INCIDENT DETAILS
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Date</p>
                    <p className="text-sm text-foreground">{selectedPCR.dateOfIncident}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Time</p>
                    <p className="text-sm text-foreground">{selectedPCR.timeOfIncident}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Location</p>
                    <p className="text-sm text-foreground">{selectedPCR.placeOfIncident}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Departure Time</p>
                    <p className="text-sm text-foreground">{selectedPCR.departureTime}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Arrival at Scene</p>
                    <p className="text-sm text-foreground">{selectedPCR.arrivalAtScene}</p>
                  </div>
                </div>
              </div>

              {/* Patient Information */}
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  PATIENT INFORMATION
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Patient Name</p>
                    <p className="text-sm text-foreground">{selectedPCR.patientName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Age / Gender</p>
                    <p className="text-sm text-foreground">{selectedPCR.age} / {selectedPCR.gender}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Birthday</p>
                    <p className="text-sm text-foreground">{selectedPCR.birthday}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Civil Status</p>
                    <p className="text-sm text-foreground">{selectedPCR.civilStatus}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Address</p>
                    <p className="text-sm text-foreground">{selectedPCR.address}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Contact Person</p>
                    <p className="text-sm text-foreground">{selectedPCR.contactPerson}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Contact Number</p>
                    <p className="text-sm text-foreground">{selectedPCR.contactNumber}</p>
                  </div>
                </div>
              </div>

              {/* Assessment */}
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  ASSESSMENT
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Initial Assessment</p>
                    <p className="text-sm text-foreground">{selectedPCR.initialAssessment}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Patient Condition</p>
                    <p className="text-sm text-foreground">{selectedPCR.patientCondition}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Injury Type</p>
                    <p className="text-sm text-foreground">{selectedPCR.injuryType}</p>
                  </div>
                </div>
              </div>

              {/* Vital Signs */}
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  VITAL SIGNS
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Blood Pressure', value: selectedPCR.vitalSigns.bp },
                    { label: 'Heart Rate', value: `${selectedPCR.vitalSigns.hr} bpm` },
                    { label: 'Resp. Rate', value: `${selectedPCR.vitalSigns.rr}/min` },
                    { label: 'Temperature', value: `${selectedPCR.vitalSigns.temp}°C` },
                    { label: 'SpO2', value: `${selectedPCR.vitalSigns.spo2}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-background/60 border border-border rounded-lg">
                      <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">{label}</p>
                      <p className="text-base text-foreground font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Field Officer Observations */}
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-3">FIELD OFFICER OBSERVATIONS</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">{selectedPCR.fieldOfficerObservations}</p>
              </div>

              {/* Transport Details */}
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-3">TRANSPORT & HOSPITAL</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Transported to Hospital</p>
                    <p className="text-sm text-foreground">{selectedPCR.transportedToHospital ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Hospital Name</p>
                    <p className="text-sm text-foreground">{selectedPCR.hospitalName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Transport Vehicle</p>
                    <p className="text-sm text-foreground">{selectedPCR.transportVehicle || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase">Waiver Signed</p>
                    <p className="text-sm text-foreground">{selectedPCR.waiverSigned ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer - Action Buttons */}
            {selectedPCR.status === 'submitted' && (
              <div className="px-6 py-4 border-t border-border flex gap-3">
                <button
                  onClick={() => handleVerify(selectedPCR.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Verify & Approve
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedPCR && (
        <div className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4" onClick={() => setShowRejectModal(false)}>
          <div
            className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Reject PCR Report</h3>
                <p className="text-xs text-muted-foreground">{selectedPCR.responseNumber}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Reason for Rejection <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this PCR report is being rejected..."
                  rows={4}
                  className="w-full px-3 py-2.5 bg-input-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-red-500 transition-all resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowRejectModal(false); setRejectionReason(''); }}
                  className="flex-1 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-all"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}