"""
Generates the two paper figures from the ACTUAL implemented architecture.

The pre-existing figures (fig_3_1_architecture.png, fig_3_2_pipeline.png) show a
DistilBERT / CNN / Random Forest / vector-DB system that was never built. These
replacements describe what the code does. Run: python3 make_figures.py
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

BLUE, GREEN, PURPLE, ORANGE, GREY = "#1f5fa9", "#1f7a4d", "#6b2fa0", "#d4610f", "#555555"


def box(ax, x, y, w, h, label, edge, face, fs=10, weight="bold", pad=0.02):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                 boxstyle=f"round,pad={pad},rounding_size=0.02",
                 linewidth=1.8, edgecolor=edge, facecolor=face, zorder=2))
    ax.text(x + w / 2, y + h / 2, label, ha="center", va="center",
            fontsize=fs, fontweight=weight, color="#111111", zorder=3, linespacing=1.45)


def arrow(ax, p, q, color):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=18,
                 linewidth=2.0, color=color, zorder=4,
                 shrinkA=2, shrinkB=2))


# ---------------------------------------------------------------- Figure 1
fig, ax = plt.subplots(figsize=(9.2, 7.4))
ax.set_xlim(0, 10); ax.set_ylim(0, 10.6); ax.axis("off")

ax.text(5, 10.15, "MindGuard: Implemented System Architecture",
        ha="center", fontsize=15, fontweight="bold", color=BLUE)
ax.text(5, 9.72, "Dashed boundary = data never crosses it",
        ha="center", fontsize=9, style="italic", color=GREY)

# Client tier (privacy boundary)
ax.add_patch(FancyBboxPatch((0.3, 5.55), 9.4, 3.95,
             boxstyle="round,pad=0.03,rounding_size=0.04", linewidth=2.2,
             edgecolor=BLUE, facecolor="#eaf3fc", linestyle=(0, (6, 3)), zorder=1))
ax.text(5, 9.22, "CLIENT TIER  ·  React 19 + Vite  ·  browser-resident",
        ha="center", fontsize=11, fontweight="bold", color=BLUE)

box(ax, 0.65, 8.15, 2.75, 0.72, "Text input\n(typed)", BLUE, "#ffffff", 9.5)
box(ax, 3.62, 8.15, 2.75, 0.72, "Webcam frames\n(never transmitted)", BLUE, "#ffffff", 9.5)
box(ax, 6.60, 8.15, 2.75, 0.72, "Microphone\n(never transmitted)", BLUE, "#ffffff", 9.5)

box(ax, 3.62, 6.95, 2.75, 0.82,
    "Optical heuristic\nBT.601 luma + edge energy\n4-leaf decision tree, 2 fps", GREEN, "#ffffff", 8.3)
box(ax, 6.60, 6.95, 2.75, 0.82,
    "Neural TTS (Kokoro 82M)\nONNX Runtime Web, q8\nWebGPU -> WASM", PURPLE, "#f6eefc", 8.3)

box(ax, 0.65, 5.85, 8.70, 0.72,
    "Score-Level Late Fusion   ·   voice 1.10  +  face 0.95  +  text prior 0.35   ->   argmax",
    ORANGE, "#fdf1e3", 9.5)

# Service tier
ax.add_patch(FancyBboxPatch((0.3, 2.35), 9.4, 2.75,
             boxstyle="round,pad=0.03,rounding_size=0.04", linewidth=2.0,
             edgecolor=GREEN, facecolor="#eaf7ef", zorder=1))
ax.text(5, 4.82, "SERVICE TIER  ·  Django 4.2 + DRF  ·  20 endpoints  ·  65 tests passing",
        ha="center", fontsize=11, fontweight="bold", color=GREEN)

box(ax, 0.62, 3.72, 2.90, 0.82,
    "Weighted Lexicon Classifier\n7 emotions, argmax\nmargin-based confidence", GREEN, "#ffffff", 8.3)
box(ax, 3.68, 3.72, 2.90, 0.82,
    "Burnout Aggregator\ntriple-weighted moving avg\nrecency x confidence x mode", GREEN, "#ffffff", 8.3)
box(ax, 6.74, 3.72, 2.90, 0.82,
    "Safety Layer\ncrisis path bypasses all\npersonalisation (test-enforced)", "#b3261e", "#fdecea", 8.3)

box(ax, 0.62, 2.62, 4.45, 0.72,
    "Optional LLM refinement (Gemini 2.5 Flash)\nheuristic answers first; LLM is never required", GREY, "#ffffff", 8.3, "normal")
box(ax, 5.20, 2.62, 4.44, 0.72,
    "Auth: PBKDF2-SHA256 (600k iters)\nHMAC-SHA256 tokens, per-purpose salts", GREY, "#ffffff", 8.3, "normal")

# Data tier
ax.add_patch(FancyBboxPatch((0.3, 0.45), 9.4, 1.55,
             boxstyle="round,pad=0.03,rounding_size=0.04", linewidth=2.0,
             edgecolor=PURPLE, facecolor="#f3eafb", zorder=1))
ax.text(5, 1.72, "DATA TIER  ·  PostgreSQL 16 (prod)  /  SQLite (dev)  ·  selected by DATABASE_URL",
        ha="center", fontsize=11, fontweight="bold", color=PURPLE)
box(ax, 0.62, 0.62, 4.45, 0.82,
    "MindGuardUser\nUUID external_id, PBKDF2 hash,\ncached burnout_score", PURPLE, "#ffffff", 8.3)
box(ax, 5.20, 0.62, 4.44, 0.82,
    "MoodLog\nindexed (client_user_id, timestamp)\nJSON details, ON DELETE SET NULL", PURPLE, "#ffffff", 8.3)

arrow(ax, (5.0, 8.10), (5.0, 7.83), BLUE)
arrow(ax, (8.0, 6.90), (8.0, 6.62), PURPLE)
arrow(ax, (2.0, 8.10), (2.0, 6.62), BLUE)
arrow(ax, (5.0, 5.78), (5.0, 5.14), ORANGE)
arrow(ax, (5.0, 2.55), (5.0, 2.04), GREEN)

fig.tight_layout()
fig.savefig("fig1_architecture.png", dpi=300, bbox_inches="tight", facecolor="white")
plt.close(fig)

# ---------------------------------------------------------------- Figure 2
fig, ax = plt.subplots(figsize=(9.6, 5.5))
ax.set_xlim(0, 10); ax.set_ylim(0, 6.3); ax.axis("off")

ax.text(5, 5.95, "Multimodal Emotion Pipeline (as implemented)",
        ha="center", fontsize=14, fontweight="bold", color=BLUE)
for x, t in ((1.45, "Input"), (4.45, "Estimator  (no trained weights)"), (8.35, "Fusion & Output")):
    ax.text(x, 5.45, t, ha="center", fontsize=10.5, fontweight="bold", color="#111111")

box(ax, 0.30, 4.18, 2.30, 0.80, "Typed text", BLUE, "#eaf3fc", 9.5)
box(ax, 0.30, 2.62, 2.30, 0.80, "Webcam frame\n160x120, 2 fps", BLUE, "#eaf3fc", 9.5)
box(ax, 0.30, 1.06, 2.30, 0.80, "Microphone\naudio", BLUE, "#eaf3fc", 9.5)

box(ax, 3.05, 4.18, 3.55, 0.80,
    "Weighted lexicon, 7 classes\n$s_e=\\mu(x)\\sum w_t$, argmax\nconf = f(top1 - top2)", GREEN, "#eaf7ef", 8.4)
box(ax, 3.05, 2.62, 3.55, 0.80,
    "$Y=0.299R+0.587G+0.114B$\nbrow / mouth / edge ratios\n4-leaf decision tree", GREEN, "#eaf7ef", 8.4)
box(ax, 3.05, 1.06, 3.55, 0.80,
    "No client-side features yet\n-> returns 'unscored'\nat confidence 0.30", "#b3261e", "#fdecea", 8.4)

box(ax, 7.05, 2.45, 2.65, 2.10,
    "Score-Level\nLate Fusion\n\nvoice  1.10\nface   0.95\ntext prior 0.35\n\nargmax -> label\n+ confidence", ORANGE, "#fdf1e3", 9.0)
box(ax, 7.05, 0.95, 2.65, 1.10,
    "Burnout index\n$B=100\\cdot\\frac{\\sum v_iw_i}{\\sum w_i}$\n$w_i=r_i c_i m_i$", PURPLE, "#f3eafb", 8.6)

for y in (4.58, 3.02, 1.46):
    arrow(ax, (2.62, y), (3.00, y), BLUE)
arrow(ax, (6.62, 4.58), (7.02, 3.90), GREEN)
arrow(ax, (6.62, 3.02), (7.02, 3.02), GREEN)
arrow(ax, (6.62, 1.46), (7.02, 2.30), GREEN)
arrow(ax, (8.37, 2.40), (8.37, 2.10), ORANGE)

ax.text(5, 0.30, "No component is trained. No dataset is used. No accuracy figure is claimed.",
        ha="center", fontsize=9.5, style="italic", color="#b3261e", fontweight="bold")

fig.tight_layout()
fig.savefig("fig2_pipeline.png", dpi=300, bbox_inches="tight", facecolor="white")
plt.close(fig)
print("wrote fig1_architecture.png and fig2_pipeline.png")
