// Captured from the same page as flacdownloader-wm-shield.js.

      (function () {
        var r = location.pathname
          .replace(/^\/(en|pt|fr|de|zh|ja|ru|ar|ko|it)(?=\/|$)/, '') || '/';
        if (/^\/(admin|estadisticas)/.test(r)) return;
        try { if (window.top !== window.self) return; } catch (e) { return; }
        if (navigator.webdriver) return;
        if (document.visibilityState === 'prerender') return;

        window.__ADS_OK = false;
        var ev = ['pointerdown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'];
        var cola = [];
        window.__alHaberPersona = function (fn) {
          if (window.__ADS_OK) return fn();
          cola.push(fn);
        };

        function go() {
          if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
          ev.forEach(function (e) { window.removeEventListener(e, go, true); });
          window.__ADS_OK = true;

          var g = document.createElement('script');
          g.async = true;
          g.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
          document.head.appendChild(g);

          window.googletag = window.googletag || { cmd: [] };

          googletag.cmd.push(function () {
            if (window.location.search) {
              var q = new URLSearchParams(window.location.search);
              var t = {};
              ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
                var v = q.get(k);
                if (v) t[k] = v;
              });
              if (Object.keys(t).length) googletag.setConfig({ targeting: t });
            }
          });

          googletag.cmd.push(function () {
            var t = 0;
            try { t = parseInt(localStorage.getItem('fd_i') || '0', 10); } catch (e) {}
            if (Date.now() - t >= 300000) {
              try { localStorage.setItem('fd_i', String(Date.now())); } catch (e) {}
              var i = googletag.defineOutOfPageSlot('/23354340575/flacdownloader/flacdownloader_Interstitial', googletag.enums.OutOfPageFormat.INTERSTITIAL);
              if (i) i.addService(googletag.pubads());
              googletag.enableServices();
              googletag.display(i);
            }
          });

          googletag.cmd.push(function () {
            var a = googletag.defineOutOfPageSlot('/23354340575/flacdownloader/flacdownloader_Anchor', googletag.enums.OutOfPageFormat.BOTTOM_ANCHOR);
            if (a) a.addService(googletag.pubads());
            googletag.enableServices();
            googletag.display(a);
          });

          cola.splice(0).forEach(function (fn) { fn(); });
        }
        ev.forEach(function (e) {
          window.addEventListener(e, go, { passive: true, capture: true });
        });
      })();
    