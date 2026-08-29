function showMessage(dialog, parentWindow, options) {
  return parentWindow ? dialog.showMessageBox(parentWindow, options) : dialog.showMessageBox(options);
}

/**
 * Checks public GitHub Releases only from an installed build. Updates download
 * in the background and are installed on a normal exit unless the user chooses
 * the explicit restart option after the download completes.
 */
export function configureDesktopUpdater({ updater, app, dialog, getWindow, logger = console }) {
  if (!app.isPackaged) return { checkForUpdates: async () => null };

  let userInitiated = false;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('update-available', info => {
    logger.info(`Downloading Reply Assistant update ${info.version}.`);
  });
  updater.on('update-not-available', info => {
    if (!userInitiated) return;
    userInitiated = false;
    showMessage(dialog, getWindow(), {
      type: 'info',
      title: 'Reply Assistant is up to date',
      message: `You already have the latest version (${info.version}).`
    });
  });
  updater.on('download-progress', progress => {
    logger.info(`Reply Assistant update download: ${Math.round(progress.percent)}%.`);
  });
  updater.on('update-downloaded', async info => {
    userInitiated = false;
    const result = await showMessage(dialog, getWindow(), {
      type: 'info',
      title: 'Update ready',
      message: `Reply Assistant ${info.version} has downloaded.`,
      detail: 'Choose Restart now to install it, or close the Assistant normally later and it will install then.',
      buttons: ['Restart now', 'Install when I exit'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    if (result.response === 0) updater.quitAndInstall(false, true);
  });
  updater.on('error', error => {
    logger.warn(`Reply Assistant update check failed: ${error.message}`);
    if (userInitiated) {
      userInitiated = false;
      showMessage(dialog, getWindow(), {
        type: 'error',
        title: 'Could not check for updates',
        message: 'The Reply Assistant could not reach its GitHub Release update feed.',
        detail: error.message
      });
    }
  });

  return {
    async checkForUpdates({ initiatedByUser = false } = {}) {
      userInitiated = initiatedByUser;
      try {
        return await updater.checkForUpdates();
      } catch (error) {
        // The error event supplies the user-facing result for manual checks.
        logger.warn(`Reply Assistant update check failed: ${error.message}`);
        return null;
      }
    }
  };
}
