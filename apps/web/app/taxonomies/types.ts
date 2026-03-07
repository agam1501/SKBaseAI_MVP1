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
