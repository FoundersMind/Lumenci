from django.db import models


class Case(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class ClaimChart(models.Model):
    class Status(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        PARSING = "parsing", "Parsing"
        READY = "ready", "Ready"
        ERROR = "error", "Error"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="claim_charts")
    name = models.CharField(max_length=255)
    source_file = models.FileField(upload_to="claim_charts/")
    source_type = models.CharField(max_length=20, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPLOADED)
    error_message = models.TextField(blank=True, default="")
    system_instructions = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.case.name} - {self.name}"


class ClaimChartRow(models.Model):
    class Strength(models.TextChoices):
        STRONG = "strong", "Strong"
        WEAK = "weak", "Weak"
        MISSING = "missing", "Missing"

    class RowOrigin(models.TextChoices):
        UPLOAD = "upload", "Original upload"
        ADDED = "added", "Added to chart"

    claim_chart = models.ForeignKey(ClaimChart, on_delete=models.CASCADE, related_name="rows")
    row_index = models.PositiveIntegerField()
    origin = models.CharField(max_length=20, choices=RowOrigin.choices, default=RowOrigin.UPLOAD)
    strength = models.CharField(max_length=20, choices=Strength.choices, default=Strength.WEAK)
    claim_text = models.TextField(blank=True, default="")
    evidence_text = models.TextField(blank=True, default="")
    reasoning_text = models.TextField(blank=True, default="")

    class Meta:
        unique_together = [("claim_chart", "row_index")]
        ordering = ["row_index"]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.claim_chart_id} #{self.row_index}"


class ProductDoc(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="product_docs")
    claim_chart = models.ForeignKey(
        ClaimChart,
        on_delete=models.CASCADE,
        related_name="product_docs",
        null=True,
        blank=True,
        help_text="Claim chart this technical / product doc supports (RAG context). Null = unassigned / legacy.",
    )
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to="product_docs/", blank=True, null=True)
    source_url = models.CharField(
        max_length=2048,
        blank=True,
        default="",
        help_text="When set, this doc was captured from the web (no local file).",
    )
    doc_type = models.CharField(max_length=20, blank=True, default="")
    extracted_text = models.TextField(blank=True, default="")
    extracted_error = models.TextField(blank=True, default="")
    extracted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class ChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    claim_chart = models.ForeignKey(ClaimChart, on_delete=models.CASCADE, related_name="chat_messages")
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class RowChange(models.Model):
    claim_chart = models.ForeignKey(ClaimChart, on_delete=models.CASCADE, related_name="row_changes")
    row_index = models.PositiveIntegerField()
    field = models.CharField(max_length=20)  # claim|evidence|reasoning|add_row
    old_text = models.TextField(blank=True, default="")
    new_text = models.TextField(blank=True, default="")
    is_undone = models.BooleanField(default=False)
    undone_at = models.DateTimeField(null=True, blank=True)
    redo_invalidated = models.BooleanField(
        default=False,
        help_text="True if a newer edit cleared the redo stack for this undone operation.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
