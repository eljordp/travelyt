from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#0A2342")
CORAL = colors.HexColor("#FF6868")
PALE = colors.HexColor("#F6F8FB")
LINE = colors.HexColor("#C9D2DE")
TEXT = colors.HexColor("#16263A")
MUTED = colors.HexColor("#58697C")
WHITE = colors.white
PAGE_W, PAGE_H = letter
MARGIN = 34
CONTENT_W = PAGE_W - 2 * MARGIN


def draw_wrapped(c, text, x, y, max_width, font="Helvetica", size=7.5, leading=9):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    c.setFont(font, size)
    c.setFillColor(TEXT)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def header(c, title, form_id, subtitle):
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 84, PAGE_W, 84, fill=1, stroke=0)
    logo = ROOT / "public" / "logo.png"
    if logo.exists():
        c.drawImage(ImageReader(str(logo)), MARGIN, PAGE_H - 61, width=92, height=31, preserveAspectRatio=True, mask="auto")
    else:
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 17)
        c.drawString(MARGIN, PAGE_H - 49, "TRAVELYT")
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 37, title)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 52, subtitle)
    c.setFillColor(CORAL)
    c.rect(0, PAGE_H - 89, PAGE_W, 5, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(MARGIN, PAGE_H - 103, f"FORM {form_id}  |  VERSION 1.0  |  CONTROLLED BLANK")
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 103, "PAGE ____ OF ____")
    return PAGE_H - 116


def section(c, y, label, height):
    c.setFillColor(PALE)
    c.setStrokeColor(LINE)
    c.roundRect(MARGIN, y - height, CONTENT_W, height, 6, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.rect(MARGIN, y - 18, CONTENT_W, 18, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN + 9, y - 12, label.upper())
    return y - 25


def field(c, x, y, label, width, value_space=1):
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 6.7)
    c.drawString(x, y, label.upper())
    c.setStrokeColor(LINE)
    line_y = y - 9
    for offset in range(value_space):
        c.line(x, line_y - offset * 14, x + width, line_y - offset * 14)
    return line_y


def checkbox(c, x, y, label, size=8, font_size=7):
    c.setStrokeColor(NAVY)
    c.rect(x, y - size + 1, size, size, fill=0, stroke=1)
    c.setFillColor(TEXT)
    c.setFont("Helvetica", font_size)
    c.drawString(x + size + 4, y - size + 2, label)


def footer(c, text):
    c.setStrokeColor(CORAL)
    c.line(MARGIN, 27, PAGE_W - MARGIN, 27)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.2)
    c.drawCentredString(PAGE_W / 2, 17, text)


def build_id_checklist():
    path = OUTPUT / "Travelyt-Physical-ID-Verification-Checklist.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle("Travelyt Physical ID Verification Checklist")
    y = header(
        c,
        "PHYSICAL ID VERIFICATION CHECKLIST",
        "TVT-ID-001",
        "Passenger custody identity record - complete in ink",
    )

    y0 = y
    inner = section(c, y0, "1. Booking and custody leg", 84)
    field(c, MARGIN + 10, inner, "Booking ID", 155)
    field(c, MARGIN + 185, inner, "Service leg (departure / arrival)", 170)
    field(c, MARGIN + 375, inner, "Verification date", 135)
    field(c, MARGIN + 10, inner - 27, "Passenger full legal name", 260)
    field(c, MARGIN + 290, inner - 27, "Date of birth", 105)
    field(c, MARGIN + 415, inner - 27, "Flight / travel date", 95)
    y = y0 - 94

    y0 = y
    inner = section(c, y0, "2. Government ID document - record from original", 126)
    checkbox(c, MARGIN + 10, inner, "Passport")
    checkbox(c, MARGIN + 82, inner, "Driver license")
    checkbox(c, MARGIN + 181, inner, "State ID")
    checkbox(c, MARGIN + 251, inner, "Permanent resident card")
    checkbox(c, MARGIN + 385, inner, "Other: __________________")
    field(c, MARGIN + 10, inner - 25, "ID number", 238)
    field(c, MARGIN + 268, inner - 25, "Expiration date", 110)
    field(c, MARGIN + 398, inner - 25, "Issuing country / state", 112)
    field(c, MARGIN + 10, inner - 52, "Name exactly as shown on ID", 238)
    field(c, MARGIN + 268, inner - 52, "Secondary ID type / last 4 if required", 242)
    checkbox(c, MARGIN + 10, inner - 82, "Name matches booking")
    checkbox(c, MARGIN + 137, inner - 82, "Photo matches person")
    checkbox(c, MARGIN + 264, inner - 82, "Document unexpired")
    checkbox(c, MARGIN + 390, inner - 82, "No visible alteration")
    y = y0 - 136

    y0 = y
    inner = section(c, y0, "3. Verification evidence and bag tie", 112)
    checkbox(c, MARGIN + 10, inner, "ID image captured under approved procedure")
    checkbox(c, MARGIN + 255, inner, "No image captured - manual record only")
    field(c, MARGIN + 10, inner - 25, "Approved image / evidence reference (not the ID number)", 315)
    field(c, MARGIN + 345, inner - 25, "Number of bags", 165)
    field(c, MARGIN + 10, inner - 52, "Seal ID(s)", 315)
    field(c, MARGIN + 345, inner - 52, "Handoff location", 165)
    checkbox(c, MARGIN + 10, inner - 80, "Passenger present")
    checkbox(c, MARGIN + 130, inner - 80, "Public terminal")
    checkbox(c, MARGIN + 240, inner - 80, "Manual review opened")
    checkbox(c, MARGIN + 383, inner - 80, "Identity mismatch")
    y = y0 - 122

    y0 = y
    inner = section(c, y0, "4. Decision, exception, and signatures", 154)
    checkbox(c, MARGIN + 10, inner, "PASS - identity verified for this custody leg")
    checkbox(c, MARGIN + 267, inner, "HOLD - supervisor review required")
    checkbox(c, MARGIN + 10, inner - 23, "REJECT - do not accept custody")
    field(c, MARGIN + 190, inner - 20, "Reason / exception code", 320)
    field(c, MARGIN + 10, inner - 49, "Agent printed name and agent ID", 245)
    field(c, MARGIN + 275, inner - 49, "Agent signature / date / time", 235)
    field(c, MARGIN + 10, inner - 78, "Passenger signature / date / time", 245)
    field(c, MARGIN + 275, inner - 78, "Supervisor approval if held", 235)
    field(c, MARGIN + 10, inner - 107, "Notes and containment action", 500, value_space=2)

    inner = section(c, 145, "5. Paper record control", 56)
    field(c, MARGIN + 10, inner, "Sealed envelope / controlled file reference", 220)
    field(c, MARGIN + 250, inner, "Records custodian", 135)
    field(c, MARGIN + 405, inner, "Transfer date / time", 105)

    c.setFillColor(colors.HexColor("#FFF4E5"))
    c.setStrokeColor(colors.HexColor("#F3C66B"))
    c.roundRect(MARGIN, 43, CONTENT_W, 37, 5, fill=1, stroke=1)
    draw_wrapped(
        c,
        "CONTROLLED PAPER PII: The completed form contains an ID number and expiration date. Keep it in the approved locked custody file. Do not enter the ID number into the Travelyt app, ordinary SharePoint, email, or chat. Retain and destroy only under the counsel-approved schedule.",
        MARGIN + 8,
        68,
        CONTENT_W - 16,
        font="Helvetica-Bold",
        size=6.6,
        leading=8,
    )
    footer(c, "Travelyt verifies custody identity only. Travelyt does not perform airline or TSA screening.")
    c.save()
    return path


def curriculum_rows(c, y, rows):
    row_h = 28
    x = MARGIN
    widths = [27, 298, 70, 70, 70]
    headers = ["#", "Competency", "Taught", "Observed", "Remedial"]
    c.setFillColor(NAVY)
    c.rect(x, y - 20, sum(widths), 20, fill=1, stroke=0)
    cursor = x
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 6.8)
    for idx, head in enumerate(headers):
        c.drawCentredString(cursor + widths[idx] / 2, y - 13, head)
        cursor += widths[idx]
    y -= 20
    for number, text in rows:
        c.setFillColor(WHITE if number % 2 else PALE)
        c.setStrokeColor(LINE)
        c.rect(x, y - row_h, sum(widths), row_h, fill=1, stroke=1)
        cursor = x
        c.setFillColor(TEXT)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(cursor + widths[0] / 2, y - 17, str(number))
        cursor += widths[0]
        draw_wrapped(c, text, cursor + 6, y - 11, widths[1] - 12, size=6.8, leading=8)
        cursor += widths[1]
        for width in widths[2:]:
            checkbox(c, cursor + width / 2 - 4, y - 10, "", size=8)
            cursor += width
        y -= row_h
    return y


def build_training_record():
    path = OUTPUT / "Travelyt-Agent-Training-Evidence-Record.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle("Travelyt Agent Training Evidence Record")
    y = header(
        c,
        "AGENT TRAINING EVIDENCE RECORD",
        "TVT-TRN-001",
        "Initial, recurring, remedial, and competency evidence",
    )

    y0 = y
    inner = section(c, y0, "1. Trainee and training session", 112)
    field(c, MARGIN + 10, inner, "Trainee full name", 245)
    field(c, MARGIN + 275, inner, "Agent / employee ID", 235)
    field(c, MARGIN + 10, inner - 27, "Trainer full name and qualification", 245)
    field(c, MARGIN + 275, inner - 27, "Training location / method", 235)
    checkbox(c, MARGIN + 10, inner - 58, "Initial")
    checkbox(c, MARGIN + 77, inner - 58, "Recurring")
    checkbox(c, MARGIN + 157, inner - 58, "Remedial")
    checkbox(c, MARGIN + 235, inner - 58, "Role change")
    field(c, MARGIN + 340, inner - 55, "Training date(s) / total hours", 170)
    y = y0 - 122

    c.setFillColor(colors.HexColor("#FFF4E5"))
    c.setStrokeColor(colors.HexColor("#F3C66B"))
    c.roundRect(MARGIN, y - 44, CONTENT_W, 44, 5, fill=1, stroke=1)
    draw_wrapped(
        c,
        "SCOPE: This is Travelyt-owned concierge custody training evidence. It does not certify TSA, IAC, airport, airline, screening, or secure-area authority. Restricted security-program material must not be attached or quoted.",
        MARGIN + 9,
        y - 15,
        CONTENT_W - 18,
        font="Helvetica-Bold",
        size=7,
        leading=9,
    )
    y -= 56

    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN, y, "2. Required competency record")
    y -= 10
    rows_page_1 = [
        (1, "Accept only the defined booking, route, timing, and bag count."),
        (2, "Reconcile each traveler, consent owner, adult email, and bag assignment."),
        (3, "Complete TVT-ID-001 from the original ID and protect paper PII."),
        (4, "Collect declarations and stop on prohibited or undeclared items."),
        (5, "Apply and verify the unique seal; capture photo, time, GPS, and traveler approval."),
        (6, "Record append-only custody events and use offline proof without rewriting history."),
        (7, "Return departure bags to the verified traveler in the public terminal by default."),
        (8, "Reject passenger-absent carrier transfer without written station authorization."),
        (9, "Keep screening outside Travelyt and never record a screening-complete claim."),
        (10, "Recognize public versus sterile/SIDA/controlled areas and stop without authority."),
        (11, "Open, contain, notify, and reconcile seal, identity, no-show, refusal, and delay exceptions."),
        (12, "Protect customer data, device access, credentials, paper forms, and retention holds."),
    ]
    y = curriculum_rows(c, y, rows_page_1)

    footer(c, "Training evidence is valid only when the evaluation and authorization page is completed.")
    c.showPage()
    y = header(
        c,
        "AGENT TRAINING EVIDENCE RECORD",
        "TVT-TRN-001",
        "Evaluation, drill evidence, authorization, and signatures",
    )

    y0 = y
    inner = section(c, y0, "3. Evaluation and drill evidence", 184)
    field(c, MARGIN + 10, inner, "Written / verbal assessment score", 160)
    field(c, MARGIN + 190, inner, "Minimum passing score", 145)
    field(c, MARGIN + 355, inner, "Assessment date", 155)
    checkbox(c, MARGIN + 10, inner - 29, "Dummy-bag pickup")
    checkbox(c, MARGIN + 130, inner - 29, "Seal and photo proof")
    checkbox(c, MARGIN + 265, inner - 29, "Traveler handoff")
    checkbox(c, MARGIN + 382, inner - 29, "Exception drill")
    field(c, MARGIN + 10, inner - 55, "Scenario / rehearsal ID and location", 245)
    field(c, MARGIN + 275, inner - 55, "Observed start and finish time", 235)
    checkbox(c, MARGIN + 10, inner - 86, "Completed TVT-ID-001 correctly")
    checkbox(c, MARGIN + 190, inner - 86, "No raw ID number entered in app")
    checkbox(c, MARGIN + 385, inner - 86, "All custody evidence reconciled")
    field(c, MARGIN + 10, inner - 111, "Deficiencies / coaching provided", 500, value_space=2)
    field(c, MARGIN + 10, inner - 151, "Corrective action and re-test evidence", 500)
    y = y0 - 194

    y0 = y
    inner = section(c, y0, "4. Authorization decision", 144)
    checkbox(c, MARGIN + 10, inner, "AUTHORIZED for supervised custody work")
    checkbox(c, MARGIN + 240, inner, "AUTHORIZED for independent custody work")
    checkbox(c, MARGIN + 10, inner - 25, "CONDITIONAL - limits below")
    checkbox(c, MARGIN + 240, inner - 25, "NOT AUTHORIZED - re-training required")
    field(c, MARGIN + 10, inner - 50, "Authorized duties, airport, route, or other limitations", 500, value_space=2)
    field(c, MARGIN + 10, inner - 90, "Authorization effective date", 155)
    field(c, MARGIN + 185, inner - 90, "Recurring training due", 155)
    field(c, MARGIN + 360, inner - 90, "Record retention / file reference", 150)
    y = y0 - 154

    y0 = y
    inner = section(c, y0, "5. Attestations", 132)
    field(c, MARGIN + 10, inner, "Trainee signature / date", 245)
    field(c, MARGIN + 275, inner, "Trainer signature / date", 235)
    field(c, MARGIN + 10, inner - 35, "Operations approver signature / date", 245)
    field(c, MARGIN + 275, inner - 35, "Training record ID", 235)
    field(c, MARGIN + 10, inner - 70, "Trainee attestation: I understand my authority limits and stop-work duties", 500)
    field(c, MARGIN + 10, inner - 103, "Approver notes", 500)

    y = y0 - 142
    inner = section(c, y, "6. Record attachments and follow-up", 108)
    checkbox(c, MARGIN + 10, inner, "Assessment")
    checkbox(c, MARGIN + 95, inner, "Scenario score sheet")
    checkbox(c, MARGIN + 230, inner, "Dummy-bag after-action")
    checkbox(c, MARGIN + 385, inner, "Remedial evidence")
    field(c, MARGIN + 10, inner - 28, "Follow-up action / owner / due date", 500, value_space=2)
    checkbox(c, MARGIN + 10, inner - 72, "Record contains no SSI or restricted program pages")
    field(c, MARGIN + 330, inner - 69, "Controlled file location", 180)

    footer(c, "Retain with the approved personnel training file. Do not attach SSI or restricted program pages.")
    c.save()
    return path


if __name__ == "__main__":
    for generated in (build_id_checklist(), build_training_record()):
        print(generated)
