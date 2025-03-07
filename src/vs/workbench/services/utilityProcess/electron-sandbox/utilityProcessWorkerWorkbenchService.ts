/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IMainProcessService, ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IPCClient, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { generateUuid } from 'vs/base/common/uuid';
import { acquirePort } from 'vs/base/parts/ipc/electron-sandbox/ipc.mp';
import { IOnDidTerminateUtilityrocessWorkerProcess, ipcUtilityProcessWorkerChannelName, IUtilityProcessWorkerProcess, IUtilityProcessWorkerService } from 'vs/platform/utilityProcess/common/utilityProcessWorkerService';

export const IUtilityProcessWorkerWorkbenchService = createDecorator<IUtilityProcessWorkerWorkbenchService>('utilityProcessWorkerWorkbenchService');

export interface IUtilityProcessWorker extends IDisposable {

	/**
	 * A IPC client to communicate to the worker process.
	 */
	client: IPCClient<string>;

	/**
	 * A promise that resolves to an object once the
	 * worker process terminates, giving information
	 * how the process terminated.
	 *
	 * This can be used to figure out whether the worker
	 * should be restarted in case of an unexpected
	 * termination.
	 */
	onDidTerminate: Promise<IOnDidTerminateUtilityrocessWorkerProcess>;
}

export interface IUtilityProcessWorkerWorkbenchService {

	readonly _serviceBrand: undefined;

	/**
	 * Will fork a new process with the provided module identifier in a utility
	 * process and establishes a message port connection to that process.
	 *
	 * Requires the forked process to be AMD module that uses our IPC channel framework
	 * to respond to the provided `channelName` as a server.
	 *
	 * The process will be automatically terminated when the workbench window closes,
	 * crashes or loads/reloads.
	 *
	 * Note on affinity: repeated calls to `createWorkerChannel` with the same `moduleId`
	 * from the same window will result in any previous forked process to get terminated.
	 * In other words, it is not possible, nor intended to create multiple workers of
	 * the same process from one window. The intent of these workers is to be reused per
	 * window and the communication channel allows to dynamically update the processes
	 * after the fact.
	 *
	 * @param process information around the process to fork as worker
	 *
	 * @returns the worker IPC client to communicate with. Provides a `dispose` method that
	 * allows to terminate the worker if needed.
	 */
	createWorker(process: IUtilityProcessWorkerProcess): Promise<IUtilityProcessWorker>;
}

export class UtilityProcessWorkerWorkbenchService extends Disposable implements IUtilityProcessWorkerWorkbenchService {

	declare readonly _serviceBrand: undefined;

	private _utilityProcessWorkerService: IUtilityProcessWorkerService | undefined = undefined;
	private get utilityProcessWorkerService(): IUtilityProcessWorkerService {
		if (!this._utilityProcessWorkerService) {
			const channel = this.useUtilityProcess ? this.mainProcessService.getChannel(ipcUtilityProcessWorkerChannelName) : this.sharedProcessService.getChannel(ipcUtilityProcessWorkerChannelName);
			this._utilityProcessWorkerService = ProxyChannel.toService<IUtilityProcessWorkerService>(channel);
		}

		return this._utilityProcessWorkerService;
	}

	constructor(
		readonly windowId: number,
		private readonly useUtilityProcess: boolean,
		@ILogService private readonly logService: ILogService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService
	) {
		super();
	}

	async createWorker(process: IUtilityProcessWorkerProcess): Promise<IUtilityProcessWorker> {
		this.logService.trace('Renderer->UtilityProcess#createWorker');

		// Get ready to acquire the message port from the utility process worker
		const nonce = generateUuid();
		const responseChannel = 'vscode:createUtilityProcessWorkerMessageChannelResult';
		const portPromise = acquirePort(undefined /* we trigger the request via service call! */, responseChannel, nonce);

		// Actually talk with the utility process service
		// to create a new process from a worker
		const onDidTerminate = this.utilityProcessWorkerService.createWorker({
			process,
			reply: { windowId: this.windowId, channel: responseChannel, nonce }
		});

		// Dispose worker upon disposal via utility process service
		const disposables = new DisposableStore();
		disposables.add(toDisposable(() => {
			this.logService.trace('Renderer->UtilityProcess#disposeWorker', process);

			this.utilityProcessWorkerService.disposeWorker({
				process,
				reply: { windowId: this.windowId }
			});
		}));

		const port = await portPromise;
		const client = disposables.add(new MessagePortClient(port, `window:${this.windowId},module:${process.moduleId}`));
		this.logService.trace('Renderer->UtilityProcess#createWorkerChannel: connection established');

		return { client, onDidTerminate, dispose: () => disposables.dispose() };
	}
}
