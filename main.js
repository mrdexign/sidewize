const path = require('path');
const fs = require('fs').promises;
const AutoLaunch = require('auto-launch');
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, screen } = require('electron');

//? ---------------------------- App Config ---------------------------
const configPath = path.join(app.getPath('userData'), 'sidewize-config.json');
const AutoLauncher = new AutoLaunch({ name: 'SideWize', path: app.getPath('exe'), isHidden: true });
const defaultConfig = { position: 'left', widthMode: '35%', isPinned: true, launchAtStartup: true, chatService: 'deepseek' };

const loadConfig = async () => {
	try {
		const configExists = await fs
			.access(configPath)
			.then(() => true)
			.catch(() => false);
		if (configExists) {
			const configData = await fs.readFile(configPath, 'utf-8');
			const config = JSON.parse(configData);
			const mergedConfig = { ...defaultConfig, ...config };

			if (app.isPackaged) {
				const isEnabled = await AutoLauncher.isEnabled();
				if (mergedConfig.launchAtStartup !== isEnabled) {
					mergedConfig.launchAtStartup ? await AutoLauncher.enable() : await AutoLauncher.disable();
				}
			}
			return mergedConfig;
		}
	} catch (error) {
		console.error('Error loading config:', error);
	}
	return defaultConfig;
};

const saveConfig = async config => {
	try {
		await fs.writeFile(configPath, JSON.stringify(config, null, 2));
		if (app.isPackaged) {
			config.launchAtStartup ? await AutoLauncher.enable() : await AutoLauncher.disable();
		}
	} catch (error) {
		console.error('Error saving config:', error);
	}
};

//? ---------------------------- App ----------------------------------
let config;
let tray = null;
let mainWindow = null;
let isWindowVisible = false;

const serviceUrls = {
	deepseek: 'https://chat.deepseek.com/',
	copilot: 'https://copilot.microsoft.com/',
	gemini: 'https://gemini.google.com/',
	grok: 'https://grok.com/',
	chatgpt: 'https://chat.openai.com/',
	chatgot: 'https://www.chatgot.io/chat',
	monica: 'https://monica.im/',
	sesame: 'https://app.sesame.com/',
};

const getServiceUrl = () => serviceUrls[config.chatService] || serviceUrls.deepseek;

const cleanupWindow = () => {
	if (!mainWindow) return;

	mainWindow.removeAllListeners();

	if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
		mainWindow.webContents.removeAllListeners();
		mainWindow.webContents.closeDevTools();
	}

	mainWindow.close();
	mainWindow = null;
};

const updateWindow = async () => {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
	const windowWidth = config.widthMode === 'full' ? screenWidth : Math.floor(screenWidth * 0.35);
	const windowX = config.position === 'left' ? 0 : screenWidth - windowWidth;

	cleanupWindow();

	mainWindow = new BrowserWindow({
		x: windowX,
		y: 0,
		width: windowWidth,
		height: screenHeight,
		show: false,
		frame: false,
		plugins: true,
		resizable: false,
		transparent: false,
		maximizable: false,
		fullscreenable: false,
		enableBlinkFeatures: 'AudioVideoTracks',
		alwaysOnTop: config.isPinned,
		icon: path.join(__dirname, 'icon.ico'),
		webPreferences: {
			sandbox: true,
			webviewTag: false,
			spellcheck: false,
			webSecurity: true,
			nodeIntegration: true,
			contextIsolation: true,
			allowRunningInsecureContent: false,
		},
	});

	await mainWindow.loadURL(getServiceUrl());

	mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
		const allowedPermissions = ['media', 'microphone'];
		callback(!!allowedPermissions.includes(permission));
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
		isWindowVisible = false;
	});

	mainWindow.on('blur', () => {
		if (mainWindow?.isVisible() && !config.isPinned) {
			mainWindow.hide();
			isWindowVisible = false;
		}
	});

	globalShortcut.register('Alt+G', () => toggleWindow());

	globalShortcut.register('Alt+V', () => {
		if (config.chatService === 'sesame') toggleWindow();
		else toggleChatService('sesame');
	});

	!tray ? createTray() : updateTrayMenu();
};

const createTray = () => {
	const iconPath = path.join(__dirname, 'icon.ico');
	const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
	tray = new Tray(trayIcon);
	tray.setToolTip('SideWize');
	updateTrayMenu();
	tray.on('click', () => toggleWindow());
};

const toggleWindow = () => {
	if (!mainWindow) return;

	if (isWindowVisible) {
		mainWindow.hide();
	} else {
		mainWindow.show();
		if (!config.isPinned) mainWindow.focus();
	}
	isWindowVisible = !isWindowVisible;
};

const togglePinWindow = () => {
	config.isPinned = !config.isPinned;
	saveConfig(config);
	mainWindow?.setAlwaysOnTop(config.isPinned);
	updateTrayMenu();
	if (config.isPinned && isWindowVisible) mainWindow?.focus();
};

const toggleWindowPosition = () => {
	config.position = config.position === 'left' ? 'right' : 'left';
	saveConfig(config);
	updateWindow();
	if (isWindowVisible) mainWindow?.show();
};

const toggleWindowWidth = () => {
	config.widthMode = config.widthMode === '35%' ? 'full' : '35%';
	saveConfig(config);
	updateWindow();
	if (isWindowVisible) mainWindow?.show();
};

const toggleLaunchAtStartup = async () => {
	config.launchAtStartup = !config.launchAtStartup;
	await saveConfig(config);
	updateTrayMenu();
};

const toggleChatService = service => {
	config.chatService = service;
	saveConfig(config);
	updateWindow();
	if (isWindowVisible) mainWindow?.show();
};

const updateTrayMenu = () => {
	if (!tray) return;

	const contextMenu = Menu.buildFromTemplate([
		{
			label: 'Show/Hide (Alt+G)',
			click: () => toggleWindow(),
		},
		{
			label: config.isPinned ? 'Unpin Window' : 'Pin Window',
			type: 'checkbox',
			checked: config.isPinned,
			click: () => togglePinWindow(),
		},
		{ type: 'separator' },
		{
			label: 'Chat Service',
			submenu: Object.keys(serviceUrls).map(service => ({
				label: service.charAt(0).toUpperCase() + service.slice(1),
				type: 'radio',
				checked: config.chatService === service,
				click: () => toggleChatService(service),
			})),
		},
		{
			label: 'Window Size',
			submenu: [
				{
					label: 'Side',
					type: 'radio',
					checked: config.widthMode === '35%',
					click: () => config.widthMode !== '35%' && toggleWindowWidth(),
				},
				{
					label: 'Full',
					type: 'radio',
					checked: config.widthMode === 'full',
					click: () => config.widthMode !== 'full' && toggleWindowWidth(),
				},
			],
		},
		{
			label: 'Window Position',
			submenu: ['left', 'right'].map(position => ({
				label: position.charAt(0).toUpperCase() + position.slice(1),
				type: 'radio',
				checked: config.position === position,
				click: () => config.position !== position && toggleWindowPosition(),
			})),
		},
		{ type: 'separator' },
		{
			label: 'Launch at Startup',
			type: 'checkbox',
			checked: config.launchAtStartup,
			click: () => toggleLaunchAtStartup(),
		},
		{
			label: 'Quit',
			click: () => app.quit(),
		},
	]);

	tray.setContextMenu(contextMenu);
};

app.whenReady().then(async () => {
	config = await loadConfig();
	await updateWindow();

	app.on('activate', () => {
		if (!BrowserWindow.getAllWindows().length) {
			updateWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
	globalShortcut.unregister('Alt+G');
	globalShortcut.unregister('Alt+V');
	globalShortcut.unregisterAll();
	if (tray) {
		tray.destroy();
		tray = null;
	}
	cleanupWindow();
});

process.on('exit', () => cleanupWindow());
