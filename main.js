const fs = require('fs');
const path = require('path');
const AutoLaunch = require('auto-launch');
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, screen } = require('electron');

//? ---------------------------- App Config ---------------------------

const configPath = path.join(app.getPath('userData'), 'sidewize-config.json');

const AutoLauncher = new AutoLaunch({ name: 'SideWize', path: app.getPath('exe'), isHidden: true });

const defaultConfig = { position: 'left', widthMode: '35%', isPinned: true, launchAtStartup: true, chatService: 'deepseek' };

const loadConfig = async () => {
	try {
		if (fs.existsSync(configPath)) {
			const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
			const mergedConfig = { ...defaultConfig, ...config };

			if (app.isPackaged) {
				const isEnabled = await AutoLauncher.isEnabled();
				if (mergedConfig.launchAtStartup !== isEnabled) {
					if (mergedConfig.launchAtStartup) await AutoLauncher.enable();
					else await AutoLauncher.disable();
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
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		if (app.isPackaged) {
			if (config.launchAtStartup) await AutoLauncher.enable();
			else await AutoLauncher.disable();
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

const getServiceUrl = () => {
	switch (config.chatService) {
		case 'deepseek':
			return 'https://chat.deepseek.com/';
		case 'gemini':
			return 'https://gemini.google.com/';
		case 'grok':
			return 'https://grok.com/';
		case 'chatgpt':
			return 'https://chat.openai.com/';
		default:
			return 'https://chat.deepseek.com/';
	}
};

const updateWindow = () => {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
	const windowWidth = config.widthMode === 'full' ? screenWidth : Math.floor(screenWidth * 0.35);
	const windowX = config.position === 'left' ? 0 : screenWidth - windowWidth;

	if (mainWindow) mainWindow.close();

	mainWindow = new BrowserWindow({
		y: 0,
		x: windowX,
		width: windowWidth,
		height: screenHeight,
		show: false,
		frame: false,
		resizable: false,
		transparent: false,
		maximizable: false,
		fullscreenable: false,
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

	mainWindow.loadURL(getServiceUrl());

	mainWindow.on('blur', () => {
		if (mainWindow?.isVisible() && !config.isPinned) {
			mainWindow.hide();
			isWindowVisible = false;
		}
	});

	globalShortcut.register('Alt+G', () => toggleWindow());

	mainWindow?.setSize(windowWidth, screenHeight);

	!tray ? createTray() : updateTrayMenu();
};

const createTray = () => {
	const iconPath = path.join(__dirname, 'icon.ico');
	const trayIcon = nativeImage.createFromPath(iconPath);
	tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
	tray.setToolTip('SideWize');
	updateTrayMenu();
	tray.on('click', () => toggleWindow());
};

const toggleWindow = () => {
	if (!mainWindow) return;
	if (isWindowVisible) mainWindow.hide();
	else {
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
		{
			type: 'separator',
		},
		{
			label: 'Chat Service',
			submenu: [
				{
					label: 'DeepSeek',
					type: 'radio',
					checked: config.chatService === 'deepseek',
					click: () => toggleChatService('deepseek'),
				},
				{
					label: 'Google Gemini',
					type: 'radio',
					checked: config.chatService === 'gemini',
					click: () => toggleChatService('gemini'),
				},
				{
					label: 'Grok',
					type: 'radio',
					checked: config.chatService === 'grok',
					click: () => toggleChatService('grok'),
				},
				{
					label: 'ChatGPT',
					type: 'radio',
					checked: config.chatService === 'chatgpt',
					click: () => toggleChatService('chatgpt'),
				},
			],
		},
		{
			label: 'Window Position',
			submenu: [
				{
					label: 'Left',
					type: 'radio',
					checked: config.position === 'left',
					click: () => {
						if (config.position !== 'left') toggleWindowPosition();
					},
				},
				{
					label: 'Right',
					type: 'radio',
					checked: config.position === 'right',
					click: () => {
						if (config.position !== 'right') toggleWindowPosition();
					},
				},
			],
		},
		{
			label: 'Window Size',
			submenu: [
				{
					label: 'Side',
					type: 'radio',
					checked: config.widthMode === '35%',
					click: () => {
						if (config.widthMode !== '35%') toggleWindowWidth();
					},
				},
				{
					label: 'Full',
					type: 'radio',
					checked: config.widthMode === 'full',
					click: () => {
						if (config.widthMode !== 'full') toggleWindowWidth();
					},
				},
			],
		},
		{
			type: 'separator',
		},
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
	updateWindow();
	app.on('activate', () => !BrowserWindow.getAllWindows().length && updateWindow());
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());

app.on('will-quit', () => globalShortcut.unregisterAll());
