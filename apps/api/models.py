import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Client(Base):
    __tablename__ = "clients"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)


class UserClient(Base):
    """Which clients a user (Supabase auth user_id) can access."""

    __tablename__ = "user_clients"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.client_id"), primary_key=True
    )


class UserRole(str, enum.Enum):
    admin = "Admin"
    responder = "Responder"
    developer = "Developer"


class UserRoles(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum", create_type=False), nullable=False
    )


class TicketStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class Ticket(Base):
    __tablename__ = "tickets"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255))
    source_system: Mapped[str | None] = mapped_column(String(255))
    short_desc: Mapped[str] = mapped_column(Text, nullable=False)
    full_desc: Mapped[str | None] = mapped_column(Text)
    cleaned_text: Mapped[str | None] = mapped_column(Text)
    resolution: Mapped[str | None] = mapped_column(Text)
    root_cause: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TicketStatus | None] = mapped_column(Enum(TicketStatus))
    priority: Mapped[str | None] = mapped_column(String(50))
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    embeddings: Mapped[list["TicketEmbedding"]] = relationship(back_populates="ticket")
    taxonomies: Mapped[list["TicketTaxonomy"]] = relationship(back_populates="ticket")
    proposals: Mapped[list["TicketProposal"]] = relationship(back_populates="ticket")


class TicketEmbedding(Base):
    __tablename__ = "ticket_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.ticket_id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    embedding_type: Mapped[str | None] = mapped_column(String(100))
    embedding: Mapped[list] = mapped_column(VECTOR(1536))
    embedding_model: Mapped[str | None] = mapped_column(String(255))
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    chunk_text: Mapped[str | None] = mapped_column(Text)
    chunk_token_count: Mapped[int | None] = mapped_column(Integer)
    chunk_start_position: Mapped[int | None] = mapped_column(Integer)
    embedding_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ticket: Mapped["Ticket"] = relationship(back_populates="embeddings")


class TicketTaxonomy(Base):
    __tablename__ = "ticket_taxonomies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.ticket_id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    taxonomy_type: Mapped[str | None] = mapped_column(String(100))
    l1: Mapped[str | None] = mapped_column(String(255))
    l2: Mapped[str | None] = mapped_column(String(255))
    l3: Mapped[str | None] = mapped_column(String(255))
    node: Mapped[str | None] = mapped_column(String(255))
    confidence_score: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    taxonomy_assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship(back_populates="taxonomies")


class TicketProposal(Base):
    __tablename__ = "ticket_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.ticket_id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    proposal_narrative: Mapped[str] = mapped_column(Text)
    similar_ticket_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    num_similar_used: Mapped[int | None] = mapped_column(Integer)
    llm_model_used: Mapped[str | None] = mapped_column(String(255))
    is_latest: Mapped[bool] = mapped_column(Boolean, default=True)
    proposal_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship(back_populates="proposals")
    feedback: Mapped[list["TicketProposalFeedback"]] = relationship(back_populates="proposal")


class TicketProposalFeedback(Base):
    __tablename__ = "ticket_proposal_feedback"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ticket_proposals.id"), nullable=False
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean)
    reason_if_rejected: Mapped[str | None] = mapped_column(Text)
    modified_narrative: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    feedback_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    proposal: Mapped["TicketProposal"] = relationship(back_populates="feedback")
