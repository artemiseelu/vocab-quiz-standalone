/* web-to-github-pwa 安装引导条
 * 行为：
 *   - 安卓 Chrome 等：捕获 beforeinstallprompt，显示“添加到主屏幕”按钮，点按触发原生安装。
 *   - iOS Safari：系统不支持自动弹窗，显示文字引导（分享→添加到主屏幕）。
 *   - 桌面 Chrome/Edge：同安卓，提供安装按钮。
 *   - 已安装（standalone 打开）或用户关闭过：不再显示。
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'pwa_install_dismissed';

  // 已以独立应用方式打开 → 不提示
  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  // 用户手动关闭过 → 7 天内不再打扰
  try {
    var ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (ts && Date.now() - ts < 7 * 24 * 3600 * 1000) return;
  } catch (e) {}

  var isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
              !window.MSStream;

  var deferredPrompt = null;

  function makeBanner(innerHTML, withInstallBtn) {
    var bar = document.createElement('div');
    bar.id = 'pwa-install-banner';
    bar.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:99999',
      'background:#1f2937', 'color:#fff', 'padding:12px 16px',
      'font-size:14px', 'line-height:1.5',
      'display:flex', 'align-items:center', 'gap:12px',
      'box-shadow:0 -2px 12px rgba(0,0,0,.25)',
      'font-family:system-ui,-apple-system,sans-serif'
    ].join(';');

    var text = document.createElement('div');
    text.style.flex = '1';
    text.innerHTML = innerHTML;
    bar.appendChild(text);

    if (withInstallBtn) {
      var btn = document.createElement('button');
      btn.textContent = '添加到桌面';
      btn.style.cssText =
        'background:#4f46e5;color:#fff;border:0;border-radius:8px;' +
        'padding:8px 14px;font-size:14px;cursor:pointer;white-space:nowrap';
      btn.addEventListener('click', function () {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.finally(function () {
            deferredPrompt = null;
            removeBanner();
          });
        }
      });
      bar.appendChild(btn);
    }

    var close = document.createElement('button');
    close.setAttribute('aria-label', '关闭');
    close.textContent = '×';
    close.style.cssText =
      'background:transparent;color:#9ca3af;border:0;font-size:22px;' +
      'cursor:pointer;line-height:1;padding:0 4px';
    close.addEventListener('click', function () {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
      removeBanner();
    });
    bar.appendChild(close);

    document.body.appendChild(bar);
  }

  function removeBanner() {
    var el = document.getElementById('pwa-install-banner');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // 安卓/桌面：拦截原生安装提示
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    makeBanner('把本应用添加到桌面，像 App 一样打开。', true);
  });

  // 安装完成后移除
  window.addEventListener('appinstalled', function () {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
    removeBanner();
  });

  // iOS：无 beforeinstallprompt，延迟显示文字引导
  if (isIOS) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        if (document.getElementById('pwa-install-banner')) return;
        makeBanner(
          '在 Safari 中点击底部的「分享」按钮，选择「添加到主屏幕」即可安装。',
          false
        );
      }, 1500);
    });
  }
})();
