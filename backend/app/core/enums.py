"""
Domain enums (PRD §4.1, §4.3, §5). Values mirror frontend/src/lib/api/enums.ts and the
`/meta` fixture. Member name == value, so SQLAlchemy stores the readable value.
"""

from enum import Enum


class Role(str, Enum):
    senior_mgmt = "senior_mgmt"
    bureau_head = "bureau_head"
    ro_officer = "ro_officer"
    intake_operator = "intake_operator"
    # Case officers are data rows, not logins (PRD §0): assigned_officer_id points at them.
    case_officer = "case_officer"


LOGIN_ROLES = frozenset({Role.senior_mgmt, Role.bureau_head, Role.ro_officer, Role.intake_operator})


class BureauKind(str, Enum):
    bureau = "bureau"
    cell = "cell"
    regional_office = "regional_office"


class Region(str, Enum):
    central = "central"
    eastern = "eastern"
    north_eastern = "north_eastern"
    northern = "northern"
    north_western = "north_western"
    south_central = "south_central"
    south_eastern = "south_eastern"
    southern = "southern"
    south_western = "south_western"
    western = "western"


class InstType(str, Enum):
    engineering = "engineering"
    management = "management"
    pharmacy = "pharmacy"
    polytechnic = "polytechnic"
    university = "university"
    university_department = "university_department"


class AliasSource(str, Enum):
    seed = "seed"
    review = "review"
    official = "official"


class SourceChannel(str, Enum):
    cpgrams = "cpgrams"
    aicte_portal = "aicte_portal"
    email = "email"
    letter = "letter"
    ro_referral = "ro_referral"
    rb_suo_motu = "rb_suo_motu"
    inspection = "inspection"


class ComplainantType(str, Enum):
    student = "student"
    parent = "parent"
    faculty = "faculty"
    staff = "staff"
    public = "public"
    anonymous = "anonymous"
    internal = "internal"


class MatchStatus(str, Enum):
    auto = "auto"
    pending_review = "pending_review"
    unresolved = "unresolved"
    provided = "provided"
    reviewed = "reviewed"


class CaseStatus(str, Enum):
    received = "received"
    under_process = "under_process"
    interim_reply = "interim_reply"
    transferred = "transferred"
    escalated = "escalated"
    reopened = "reopened"
    disposed = "disposed"


class ActionType(str, Enum):
    assign = "assign"
    transfer = "transfer"
    escalate = "escalate"
    interim_reply = "interim_reply"
    remark = "remark"
    dispose = "dispose"
    reopen = "reopen"


class DisposeOutcome(str, Enum):
    redressed = "redressed"
    action_taken_against_institution = "action_taken_against_institution"
    rejected_not_maintainable = "rejected_not_maintainable"
    forwarded_to_institution_grc = "forwarded_to_institution_grc"


class ReviewStatus(str, Enum):
    pending = "pending"
    resolved = "resolved"


class OverlapLevel(str, Enum):
    institution = "institution"
    parent = "parent"
    trust = "trust"


class OverlapTier(str, Enum):
    probable = "probable"
    possible = "possible"


class OverlapGroupStatus(str, Enum):
    open = "open"
    confirmed = "confirmed"
    dismissed = "dismissed"
    resolved = "resolved"


class PairDecision(str, Enum):
    none = "none"
    confirmed = "confirmed"
    dismissed = "dismissed"


class AlertType(str, Enum):
    overlap = "overlap"
    sla_warning = "sla_warning"
    sla_breach = "sla_breach"
    escalation = "escalation"
    reminder = "reminder"


class AlertSeverity(str, Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class ResolutionDecision(str, Enum):
    """`resolution.decision` (PRD §5); `provided` = the operator supplied the Permanent ID."""

    auto = "auto"
    pending_review = "pending_review"
    unresolved = "unresolved"
    provided = "provided"


class OverlapDecision(str, Enum):
    confirm = "confirm"
    dismiss = "dismiss"
    resolve = "resolve"
