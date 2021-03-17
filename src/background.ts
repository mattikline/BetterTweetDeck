import {browser} from 'webextension-polyfill-ts';

import {getTransString} from './components/trans';
import {isSafari} from './helpers/browserHelpers';
import {ExtensionSettings, getExtensionVersion} from './helpers/webExtensionHelpers';
import {getValidatedSettings, setupSettingsInBackground} from './services/backgroundSettings';
import {BTDMessageEvent, BTDMessages} from './types/btdMessageTypes';

(async () => {
  await setupSettingsInBackground();

  browser.runtime.onMessage.addListener(async (request: BTDMessageEvent, sender) => {
    if (sender.url !== 'https://tweetdeck.twitter.com/') {
      throw new Error('Message not coming from BTD');
    }

    switch (request.data.name) {
      case BTDMessages.OPEN_SETTINGS: {
        browser.tabs.create({
          url: 'build/options/index.html',
        });
        return undefined;
      }

      case BTDMessages.BTD_READY: {
        await ExtensionSettings.set({
          ...(await getValidatedSettings()),
          needsToShowUpdateBanner: false,
          needsToShowFollowPrompt: false,
        });
        return undefined;
      }

      default:
        return undefined;
    }
  });

  // // Get the settings from the browser.
  const settings = await getValidatedSettings();
  const textLimitWithLink = 254;

  if (settings.installedVersion !== getExtensionVersion()) {
    await ExtensionSettings.set({
      ...settings,
      installedVersion: getExtensionVersion(),
      needsToShowUpdateBanner: true,
    });
  }

  if (!settings.enableShareItem || isSafari) {
    return;
  }

  browser.contextMenus.create({
    title: getTransString('settings_share_on_tweetdeck'),
    contexts: ['page', 'selection', 'image', 'link'],
    onclick: async (info, tab) => {
      const urlToShare = info.linkUrl || info.srcUrl || info.pageUrl;
      const baseText = info.selectionText || tab.title || '';
      const textToShare = !settings.shouldShortenSharedText
        ? baseText
        : baseText.slice(0, textLimitWithLink) + '…';

      const tabs = await browser.tabs.query({
        url: '*://tweetdeck.twitter.com/*',
      });

      if (tabs.length === 0) {
        return;
      }

      const TweetDeckTab = tabs[0];

      if (!TweetDeckTab.id || !TweetDeckTab.windowId) {
        return;
      }

      await browser.windows.update(TweetDeckTab.windowId, {
        focused: true,
      });

      await browser.tabs.update(TweetDeckTab.id, {active: true});
      browser.tabs.sendMessage(TweetDeckTab.id, {
        action: 'share',
        text: textToShare,
        url: urlToShare,
      });
    },
  });
})();
