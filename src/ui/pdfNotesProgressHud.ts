import { PdfNotesPhase } from "../types/pdfNotes";

export interface PdfNotesProgressView {
	title: string;
	phaseLabel: string;
	detail: string;
	hint: string;
	percent: number;
	phase: PdfNotesPhase;
}

/** Remove leading emoji from phase strings for a cleaner HUD label. */
export function cleanPhaseLabel(label: string): string {
	return label.replace(/^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}]+/u, "").trim() || label;
}

/**
 * Apple-style floating progress HUD (bottom-right, glass, thin bar).
 * Built with DOM + CSS classes — no Modal, no innerHTML templates.
 */
export class PdfNotesProgressHud {
	private root: HTMLElement | null = null;
	private titleEl: HTMLElement | null = null;
	private detailEl: HTMLElement | null = null;
	private percentEl: HTMLElement | null = null;
	private fillEl: HTMLElement | null = null;
	private hintEl: HTMLElement | null = null;

	constructor(private readonly onClick?: () => void) {}

	mount(): void {
		this.unmount();

		this.root = activeDocument.body.createDiv({ cls: "lecture-lens-pdf-hud" });

		const body = this.root.createDiv({ cls: "lecture-lens-pdf-hud-body" });
		const row = body.createDiv({ cls: "lecture-lens-pdf-hud-row" });

		row.createDiv({ cls: "lecture-lens-pdf-hud-icon" });

		const textCol = row.createDiv({ cls: "lecture-lens-pdf-hud-text" });
		this.titleEl = textCol.createDiv({ cls: "lecture-lens-pdf-hud-title" });
		this.detailEl = textCol.createDiv({ cls: "lecture-lens-pdf-hud-detail" });

		this.percentEl = row.createDiv({ cls: "lecture-lens-pdf-hud-percent" });

		const track = body.createDiv({ cls: "lecture-lens-pdf-hud-track" });
		this.fillEl = track.createDiv({ cls: "lecture-lens-pdf-hud-fill" });

		this.hintEl = body.createDiv({ cls: "lecture-lens-pdf-hud-hint" });

		if (this.onClick) {
			this.root.addEventListener("click", this.onClick);
		}

		window.requestAnimationFrame(() => this.root?.addClass("is-visible"));
	}

	update(view: PdfNotesProgressView): void {
		if (!this.root || !this.titleEl || !this.detailEl || !this.percentEl || !this.fillEl) return;

		const clamped = Math.max(0, Math.min(100, view.percent));
		const isError = view.phase === "error";
		const isDone = view.phase === "done";

		this.titleEl.setText(cleanPhaseLabel(view.phaseLabel));
		this.detailEl.setText(view.detail);
		this.percentEl.setText(isError ? "—" : `${clamped}%`);
		this.fillEl.style.width = isError ? "0%" : `${clamped}%`;

		if (this.hintEl) {
			this.hintEl.setText(view.hint);
			this.hintEl.toggleClass("is-hidden", !view.hint);
		}

		this.root.dataset.phase = view.phase;
		this.root.toggleClass("is-done", isDone);
		this.root.toggleClass("is-error", isError);
		this.root.toggleClass("is-clickable", isDone && !!this.onClick);
	}

	dismiss(): void {
		if (!this.root) return;
		this.root.removeClass("is-visible");
		this.root.addClass("is-dismissing");
		const el = this.root;
		window.setTimeout(() => {
			el.remove();
			if (this.root === el) this.root = null;
		}, 320);
	}

	unmount(): void {
		if (this.onClick && this.root) {
			this.root.removeEventListener("click", this.onClick);
		}
		this.root?.remove();
		this.root = null;
		this.titleEl = null;
		this.detailEl = null;
		this.percentEl = null;
		this.fillEl = null;
		this.hintEl = null;
	}
}
