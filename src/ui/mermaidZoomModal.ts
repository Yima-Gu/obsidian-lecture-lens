import { App, Modal, setIcon } from "obsidian";
import { MermaidEnhanceLabels } from "../utils/mermaidEnhance";

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const SCALE_STEP = 0.15;

export class MermaidZoomModal extends Modal {
	private scale = 1;
	private contentWrap!: HTMLElement;
	private disposers: Array<() => void> = [];

	constructor(
		app: App,
		private readonly diagram: HTMLElement,
		private readonly labels: MermaidEnhanceLabels
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("lecture-lens-mermaid-zoom-modal");
		contentEl.empty();
		contentEl.addClass("lecture-lens-mermaid-zoom-body");

		const toolbar = contentEl.createEl("div", { cls: "lecture-lens-mermaid-zoom-toolbar" });
		toolbar.createEl("span", {
			cls: "lecture-lens-mermaid-zoom-title",
			text: this.labels.zoomTitle,
		});

		const actions = toolbar.createEl("div", { cls: "lecture-lens-mermaid-zoom-actions" });
		this.addToolbarButton(actions, "zoom-in", this.labels.zoomIn, () => this.adjustScale(SCALE_STEP));
		this.addToolbarButton(actions, "zoom-out", this.labels.zoomOut, () => this.adjustScale(-SCALE_STEP));
		this.addToolbarButton(actions, "maximize-2", this.labels.zoomReset, () => this.resetScale());

		contentEl.createEl("div", {
			cls: "lecture-lens-mermaid-zoom-help",
			text: this.labels.zoomHint,
		});

		const viewport = contentEl.createEl("div", { cls: "lecture-lens-mermaid-zoom-viewport" });
		this.contentWrap = viewport.createEl("div", { cls: "lecture-lens-mermaid-zoom-content" });
		this.contentWrap.appendChild(this.diagram);
		this.applyScale();

		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
			this.adjustScale(delta);
		};
		viewport.addEventListener("wheel", onWheel, { passive: false });
		this.disposers.push(() => viewport.removeEventListener("wheel", onWheel));
	}

	onClose(): void {
		for (const dispose of this.disposers) dispose();
		this.disposers = [];
		this.contentEl.empty();
	}

	private addToolbarButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		handler: () => void
	): void {
		const button = parent.createEl("button", {
			cls: "clickable-icon lecture-lens-mermaid-zoom-btn",
			attr: { "aria-label": label, title: label },
		});
		setIcon(button, icon);
		const onClick = () => handler();
		button.addEventListener("click", onClick);
		this.disposers.push(() => button.removeEventListener("click", onClick));
	}

	private adjustScale(delta: number): void {
		this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale + delta));
		this.applyScale();
	}

	private resetScale(): void {
		this.scale = 1;
		this.applyScale();
	}

	private applyScale(): void {
		this.contentWrap.style.transform = `scale(${this.scale})`;
	}
}
