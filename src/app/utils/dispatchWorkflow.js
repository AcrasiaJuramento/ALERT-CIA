export const DISPATCH_EDIT_KEY = "alert-cia-dispatch-edit-id";

export const DISPATCH_STATUSES = {
  DRAFT: "Draft",
  DISPATCHED: "Dispatched",
  SENT: "Sent to Responding Team",
  ACCEPTED: "Accepted by Responding Team",
  PCR_IN_PROGRESS: "PCR In Progress",
  PCR_COMPLETED: "PCR Completed",
  CANCELLED: "Cancelled",
};

export function generateResponseNumber() {
  return `RESP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
}
