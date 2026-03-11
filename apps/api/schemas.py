import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from models import TicketStatus, UserRole

# --- Users ---


class UserRead(BaseModel):
    user_id: uuid.UUID
    email: str
    role: UserRole
    invited_at: datetime


class UserInvite(BaseModel):
    email: str
    role: UserRole


# --- User Roles ---


class UserRoleRead(BaseModel):
    user_id: uuid.UUID
    role: UserRole
    model_config = ConfigDict(from_attributes=True)


class UserRoleCreate(BaseModel):
    user_id: uuid.UUID
    role: UserRole


# --- Clients ---


class ClientRead(BaseModel):
    client_id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class ClientCreate(BaseModel):
    name: str


# --- Tickets ---


class TicketCreate(BaseModel):
    external_id: str | None = None
    source_system: str | None = None
    short_desc: str
    full_desc: str | None = None
    resolution: str | None = None
    root_cause: str | None = None
    status: TicketStatus | None = None
    priority: str | None = None
    is_resolved: bool = False
    is_test: bool = False


class TicketRead(BaseModel):
    ticket_id: uuid.UUID
    client_id: uuid.UUID
    external_id: str | None
    source_system: str | None
    short_desc: str
    full_desc: str | None
    cleaned_text: str | None
    resolution: str | None
    root_cause: str | None
    status: TicketStatus | None
    priority: str | None
    is_resolved: bool
    is_test: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class TicketStatusUpdate(BaseModel):
    status: TicketStatus
    is_resolved: bool


class TicketUploadRowError(BaseModel):
    row: int
    message: str


class TicketUploadResult(BaseModel):
    created: int
    errors: list[TicketUploadRowError]


# --- Proposals ---


class ProposalRead(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    proposal_narrative: str
    similar_ticket_ids: list[uuid.UUID] | None
    is_latest: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackCreate(BaseModel):
    accepted: bool
    reason_if_rejected: str | None = None
    modified_narrative: str | None = None


class FeedbackRead(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    accepted: bool
    reason_if_rejected: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Taxonomies (ticket_taxonomies - assignments) ---


class TaxonomyRead(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    taxonomy_type: str | None
    l1: str | None
    l2: str | None
    l3: str | None
    node: str | None
    confidence_score: float | None
    source: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class TaxonomyCreate(BaseModel):
    l1: str | None = None
    l2: str | None = None
    l3: str | None = None
    node: str | None = None


# --- Taxonomy reference tables ---


class TaxonomyBusinessCategoryRead(BaseModel):
    """Schema for public.taxonomy_business_category."""

    id: uuid.UUID
    client_id: uuid.UUID | None
    l1: str
    l2: str
    l3: str
    node: str
    label: str | None
    parent_node_id: str | None
    is_active: bool | None
    created_at: datetime | None
    updated_at: datetime | None
    keywords: str | None

    model_config = ConfigDict(from_attributes=True)


class TaxonomyApplicationRead(BaseModel):
    """Schema for public.taxonomy_application."""

    id: uuid.UUID
    client_id: uuid.UUID | None
    l1: str
    l2: str
    l3: str
    node_id: str
    label: str | None
    software_vendor: str | None
    is_active: bool | None
    created_at: datetime | None
    updated_at: datetime | None
    product_name: str | None
    keywords: dict | list | None  # jsonb
    app_group: str | None
    category: str | None
    description: str | None

    model_config = ConfigDict(from_attributes=True)


class TaxonomyResolutionRead(BaseModel):
    """Schema for public.taxonomy_resolution."""

    id: uuid.UUID
    client_id: uuid.UUID | None
    l1_outcome: str
    l2_action_type: str
    l3_resolution_code: str
    resolution_code: str
    resolution_durability: str | None
    is_active: bool | None
    created_at: datetime | None
    updated_at: datetime | None
    definition: str | None
    examples: str | None
    usage_guidance: str | None

    model_config = ConfigDict(from_attributes=True)


class TaxonomyRootCauseRead(BaseModel):
    """Schema for public.taxonomy_root_cause."""

    id: uuid.UUID
    client_id: uuid.UUID | None
    l1_cause_domain: str
    l2_cause_type: str
    l3_root_cause: str
    root_cause_code_id: str
    usage_guidance: str | None
    is_active: bool | None
    created_at: datetime | None
    updated_at: datetime | None
    default_owner: str | None
    preventability: str | None
    change_related: str | None
    definition: str | None
    examples: str | None

    model_config = ConfigDict(from_attributes=True)


# --- Analytics ---


class CrossTabRow(BaseModel):
    business_l1: str
    application_l1: str
    count: int


class CrossTabMatrix(BaseModel):
    business_l1s: list[str]
    application_l1s: list[str]
    counts: list[CrossTabRow]
