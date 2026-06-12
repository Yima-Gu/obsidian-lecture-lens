import { Notice, Setting } from "obsidian";
import { normalizeLocalModelId } from "../constants/localEmbeddingModels";
import { EmbeddingModelStatus } from "../services/embeddingModelStatus";
import LectureLensPlugin from "../main";

export function renderEmbeddingModelDownloadSection(
	containerEl: HTMLElement,
	plugin: LectureLensPlugin,
	tr: (key: Parameters<LectureLensPlugin["tr"]>[0], params?: Parameters<LectureLensPlugin["tr"]>[1]) => string,
	onChanged: () => void
): void {
	const statusHost = containerEl.createDiv({ cls: "lecture-lens-embedding-download-panel" });

	const renderStatus = (status: EmbeddingModelStatus | null): void => {
		statusHost.empty();

		const state = status?.state ?? "not_downloaded";
		const stateEl = statusHost.createEl("div", {
			cls: `lecture-lens-embedding-state lecture-lens-embedding-state-${state}`,
		});

		const stateKey = {
			not_downloaded: "settings.embeddingDownload.stateNotDownloaded",
			downloading: "settings.embeddingDownload.stateDownloading",
			ready: "settings.embeddingDownload.stateReady",
			error: "settings.embeddingDownload.stateError",
		}[state] as Parameters<LectureLensPlugin["tr"]>[0];

		stateEl.createEl("strong", { text: tr(stateKey) });

		const message = status?.message?.trim();
		if (message) {
			statusHost.createEl("p", {
				cls: "lecture-lens-embedding-progress",
				text: message,
			});
		}

		if (status?.error) {
			statusHost.createEl("p", {
				cls: "lecture-lens-embedding-error",
				text: status.error,
			});
		}

		if (status?.state === "ready" && status.updatedAt) {
			void plugin.localEmbeddingService.getModelCacheDir().then((path) => {
				statusHost.createEl("p", {
					cls: "setting-item-description",
					text: tr("settings.embeddingDownload.cachePath", { path }),
				});
			});
		}
	};

	void plugin.embeddingModelStatusService.load().then(renderStatus);

	new Setting(containerEl)
		.setName(tr("settings.embeddingDownload.name"))
		.setDesc(tr("settings.embeddingDownload.desc"))
		.addButton((button) =>
			button
				.setButtonText(tr("settings.embeddingDownload.button"))
				.setCta()
				.onClick(async () => {
					const runtime = plugin.getEmbeddingRuntimeConfig();
					if (runtime.mode !== "local") return;

					button.setDisabled(true).setButtonText(tr("settings.embeddingDownload.downloading"));
					const progressEl = statusHost.createEl("p", {
						cls: "lecture-lens-embedding-progress",
						text: tr("settings.embeddingDownload.starting"),
					});

					try {
						await plugin.downloadEmbeddingModel((message) => {
							progressEl.setText(message);
							void plugin.embeddingModelStatusService.load().then(renderStatus);
						});
						new Notice(tr("settings.embeddingDownload.success"), 5000);
					} catch (error) {
						const message = plugin.formatEmbeddingError(error);
						new Notice(tr("settings.embeddingDownload.failed", { message }), 12000);
					} finally {
						button.setDisabled(false).setButtonText(tr("settings.embeddingDownload.button"));
						const status = await plugin.embeddingModelStatusService.load();
						renderStatus(status);
						onChanged();
					}
				})
		);

	new Setting(containerEl)
		.setName(tr("settings.embeddingDownload.verify.name"))
		.setDesc(tr("settings.embeddingDownload.verify.desc"))
		.addButton((button) =>
			button.setButtonText(tr("settings.embeddingDownload.verify.button")).onClick(async () => {
				button.setDisabled(true);
				try {
					const runtime = plugin.getEmbeddingRuntimeConfig();
					const modelId = normalizeLocalModelId(runtime.localModelId);
					await plugin.localEmbeddingService.verifyModel(
						modelId,
						runtime.hfMirrorUrl,
						(message) => {
							statusHost.createEl("p", {
								cls: "lecture-lens-embedding-progress",
								text: message,
							});
						}
					);
					new Notice(tr("settings.embeddingDownload.verify.success"), 4000);
				} catch (error) {
					new Notice(
						tr("settings.embeddingDownload.verify.failed", {
							message: plugin.formatEmbeddingError(error),
						}),
						10000
					);
				} finally {
					button.setDisabled(false);
					const status = await plugin.embeddingModelStatusService.load();
					renderStatus(status);
				}
			})
		);
}
