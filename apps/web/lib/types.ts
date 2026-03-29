// Shared domain types for SKBaseAI frontend

export type UserRole = { role: "Admin" | "Responder" | "Developer" };

export type Ticket = {
  ticket_id: string;
  client_id: string;
  external_id: string | null;
  source_system: string | null;
  short_desc: string;
  full_desc: string | null;
  cleaned_text: string | null;
  resolution: string | null;
  root_cause: string | null;
  status: string | null;
  priority: string | null;
  is_resolved: boolean;
  is_test: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  enrichment_status: string | null;
};

export type Taxonomy = {
  id: string;
  taxonomy_type: string | null;
  l1: string | null;
  l2: string | null;
  l3: string | null;
  node: string | null;
  confidence_score: number | null;
  source: string | null;
};

export type Proposal = {
  proposal_id: string;
  narrative: string;
  is_latest: boolean;
};

export type TaxonomyBusinessCategory = {
  id: string;
  client_id: string | null;
  l1: string;
  l2: string;
  l3: string;
  node: string;
  label: string | null;
  parent_node_id: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  keywords: string | null;
};

export type TaxonomyApplication = {
  id: string;
  client_id: string | null;
  l1: string;
  l2: string;
  l3: string;
  node_id: string;
  label: string | null;
  software_vendor: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  product_name: string | null;
  keywords: unknown;
  app_group: string | null;
  category: string | null;
  description: string | null;
};

export type TaxonomyResolution = {
  id: string;
  client_id: string | null;
  l1_outcome: string;
  l2_action_type: string;
  l3_resolution_code: string;
  resolution_code: string;
  resolution_durability: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  definition: string | null;
  examples: string | null;
  usage_guidance: string | null;
};

export type MonthlyTicketStat = {
  month: string; // "YYYY-MM"
  opened: number;
  closed: number;
  avg_mttr_hours: number | null;
};

export type TaxonomyRootCause = {
  id: string;
  client_id: string | null;
  l1_cause_domain: string;
  l2_cause_type: string;
  l3_root_cause: string;
  root_cause_code_id: string;
  usage_guidance: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  default_owner: string | null;
  preventability: string | null;
  change_related: string | null;
  definition: string | null;
  examples: string | null;
};
