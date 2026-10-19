export type Term = {
  id: string;
  text: string;
  text_hash: string;
  requires: string[];
  amount_wei: string;
  generation: number;
  approval_generation: number;
  reapproval_deadline: number;
  claimed: boolean;
  refunded: boolean;
};

export type Edit = {
  id: string;
  old_text: string;
  new_text: string;
  screen: string;
  material: string;
};

export type Amendment = {
  phase: "PROPOSED" | "REVIEW";
  base_revision: number;
  proposer: string;
  signed_by?: string;
  proposal_hash: string;
  deadline: number;
  edits: Edit[];
};

export type OrderState = {
  version: string;
  title: string;
  buyer: string;
  supplier: string;
  status: string;
  agreement_hash: string;
  terms: Term[];
  checks: string[];
  total_wei: string;
  reserved_wei: string;
  revision: number;
  check_deadline: number;
  fund_deadline: number;
  accept_deadline: number;
  settle_deadline: number;
  claim_deadline: number;
  amendment: Amendment | null;
  history: Array<Record<string, unknown>>;
};
