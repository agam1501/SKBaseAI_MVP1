import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from models import TicketStatus, UserRole

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


class TicketRead(BaseModel):
    ticket_id: uuid.UUID
    client_id: uuid.UUID
    external_id: str | None
    short_desc: str
    full_desc: str | None
    resolution: str | None
    status: TicketStatus | None
    priority: str | None
    is_resolved: bool
    created_at: datetime

    model_config = {"from_attributes": True}


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


# --- Taxonomies ---


class TaxonomyRead(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    taxonomy_type: str | None
    l1: str | None
    l2: str | None
    l3: str | None
    confidence_score: float | None
    is_active: bool

    model_config = {"from_attributes": True}
