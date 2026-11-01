// Captured from the user-provided flacdownloader.com page, 2026-11-01.

      (function() {
        if (location.pathname.indexOf("/admin") !== -1 || location.pathname.indexOf("/estadisticas") !== -1) return;
        var host = null, btnMuro = null, watcher = null, backup = null, decided = false, recreados = 0, focoAtrapado = false;
        var DEBUG = location.search.indexOf("wm_debug=1") !== -1;
        var S = { adsjs: "pendiente", cosmetico: "pendiente", stub: false, ceboRedFallos: 0, brave: false };
        function log(msg) {
          if (!DEBUG) return;
          try {
            console.log("[WM-Shield] " + msg, JSON.stringify(S));
          } catch (e) {
          }
        }
        if (DEBUG) {
          window.__wm = S;
          window.__wmDecidido = function() {
            return decided;
          };
        }
        function esBloqueador(s) {
          if (s.adsjs === "bloqueado") return true;
          if (s.cosmetico === "oculto") return true;
          if (s.brave && (s.stub || s.ceboRedFallos >= 1)) return true;
          if (s.stub && s.ceboRedFallos >= 1) return true;
          return false;
        }
        var GRACE_MS = DEBUG ? 0 : 90000;
        var INICIO = (function () {
          var k = "_wg", ahora = Date.now(), v;
          try { v = parseInt(localStorage.getItem(k), 10); } catch (e) {}
          if (!v || isNaN(v) || v > ahora || ahora - v > 432e5) {
            v = ahora;
            try { localStorage.setItem(k, String(v)); } catch (e) {}
          }
          return v;
        })();
        function evaluar() {
          if (decided) return;
          log("evaluar");
          if (!esBloqueador(S)) return;
          decided = true;
          var remaining = GRACE_MS - (Date.now() - INICIO);
          if (remaining <= 0) wall();
          else setTimeout(wall, remaining);
        }
        function dom() {
          return ["flac", "down", "loader", ".com"].join("");
        }
        var L = (function() {
          var SUP = ["en", "pt", "fr", "de", "zh", "ja", "ru", "ar", "ko", "it"];
          var seg = location.pathname.split("/").filter(Boolean)[0];
          if (SUP.indexOf(seg) !== -1) return seg;
          var n = (navigator.language || "es").slice(0, 2).toLowerCase();
          return n === "es" || SUP.indexOf(n) !== -1 ? n : "es";
        })();
        var TR = {
          es: { t: "AdBlock Detectado", p: "Entendemos perfectamente que los anuncios pueden ser molestos, pero son la única forma de costear los servidores y mantener este servicio 100% gratuito.<br><br>Por favor, apóyanos <strong>desactivando tu bloqueador</strong>.", c: "Te recomendamos usar <strong>Google Chrome</strong>. Brave y otros navegadores que bloquean anuncios por defecto no funcionan en esta web.", b: "Ya lo desactivé, Recargar" },
          en: { t: "AdBlock Detected", p: "We totally understand that ads can be annoying, but they're the only way to pay for the servers and keep this service 100% free.<br><br>Please support us by <strong>disabling your blocker</strong>.", c: "We recommend using <strong>Google Chrome</strong>. Brave and other browsers that block ads by default do not work on this site.", b: "I disabled it, Reload" },
          pt: { t: "AdBlock Detectado", p: "Entendemos perfeitamente que os anúncios podem ser incômodos, mas são a única forma de custear os servidores e manter este serviço 100% gratuito.<br><br>Por favor, apoie-nos <strong>desativando seu bloqueador</strong>.", c: "Recomendamos usar o <strong>Google Chrome</strong>. O Brave e outros navegadores que bloqueiam anúncios por padrão não funcionam neste site.", b: "Já desativei, Recarregar" },
          fr: { t: "AdBlock Détecté", p: "Nous comprenons que les publicités puissent être gênantes, mais elles sont le seul moyen de financer les serveurs et de garder ce service 100% gratuit.<br><br>Merci de nous soutenir en <strong>désactivant votre bloqueur</strong>.", c: "Nous vous recommandons <strong>Google Chrome</strong>. Brave et les autres navigateurs qui bloquent les publicités par défaut ne fonctionnent pas sur ce site.", b: "Je l'ai désactivé, Recharger" },
          de: { t: "AdBlock erkannt", p: "Wir verstehen, dass Werbung nervig sein kann, aber sie ist die einzige Möglichkeit, die Server zu finanzieren und diesen Dienst 100% kostenlos zu halten.<br><br>Bitte unterstütze uns, indem du <strong>deinen Blocker deaktivierst</strong>.", c: "Wir empfehlen <strong>Google Chrome</strong>. Brave und andere Browser, die Werbung standardmäßig blockieren, funktionieren auf dieser Seite nicht.", b: "Deaktiviert, Neu laden" },
          zh: { t: "检测到广告拦截器", p: "我们完全理解广告可能很烦人，但它们是支付服务器费用并保持本服务100%免费的唯一方式。<br><br>请<strong>关闭你的拦截器</strong>来支持我们。", c: "我们推荐使用 <strong>Google Chrome</strong>。Brave 以及其他默认拦截广告的浏览器无法使用本网站。", b: "我已关闭，重新加载" },
          ja: { t: "広告ブロックを検出", p: "広告が煩わしいことは承知していますが、サーバー費用をまかない、このサービスを100%無料で維持する唯一の方法です。<br><br><strong>ブロッカーを無効にして</strong>応援してください。", c: "<strong>Google Chrome</strong> のご利用をおすすめします。Brave など標準で広告をブロックするブラウザでは、このサイトは利用できません。", b: "解除しました。再読み込み" },
          ru: { t: "Обнаружен AdBlock", p: "Мы понимаем, что реклама может раздражать, но это единственный способ оплачивать серверы и сохранять сервис на 100% бесплатным.<br><br>Пожалуйста, поддержите нас, <strong>отключив блокировщик</strong>.", c: "Рекомендуем использовать <strong>Google Chrome</strong>. Brave и другие браузеры, блокирующие рекламу по умолчанию, на этом сайте не работают.", b: "Я отключил, Перезагрузить" },
          ar: { t: "تم اكتشاف مانع الإعلانات", p: "نتفهم تمامًا أن الإعلانات قد تكون مزعجة، لكنها الطريقة الوحيدة لتغطية تكاليف الخوادم وإبقاء هذه الخدمة مجانية 100%.<br><br>من فضلك ادعمنا <strong>بتعطيل مانع الإعلانات</strong>.", c: "ننصحك باستخدام <strong>Google Chrome</strong>. متصفح Brave والمتصفحات الأخرى التي تحظر الإعلانات افتراضيًا لا تعمل على هذا الموقع.", b: "لقد عطّلته، إعادة التحميل" },
          ko: { t: "광고 차단 감지됨", p: "광고가 불편할 수 있다는 점 충분히 이해합니다. 하지만 서버 비용을 충당하고 이 서비스를 100% 무료로 유지하는 유일한 방법입니다.<br><br><strong>차단기를 해제하여</strong> 응원해 주세요.", c: "<strong>Google Chrome</strong> 사용을 권장합니다. Brave 등 기본으로 광고를 차단하는 브라우저에서는 이 사이트를 이용할 수 없습니다.", b: "해제했어요, 새로고침" },
          it: { t: "AdBlock Rilevato", p: "Capiamo che le pubblicità possano essere fastidiose, ma sono l'unico modo per coprire i server e mantenere questo servizio 100% gratuito.<br><br>Per favore, sostienici <strong>disattivando il tuo blocco</strong>.", c: "Ti consigliamo di usare <strong>Google Chrome</strong>. Brave e gli altri browser che bloccano la pubblicità per impostazione predefinita non funzionano su questo sito.", b: "L'ho disattivato, Ricarica" }
        };
        var TT = TR[L] || TR.es;
        var RTL = L === "ar";
        var CSS = '.c{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;width:100%;max-width:420px;max-height:100%;overflow:auto;box-sizing:border-box;padding:32px 28px 22px;border-radius:20px;background:#fff;color:#1f2330;text-align:center;box-shadow:0 0 0 1px rgba(15,23,42,.06),0 24px 64px -12px rgba(15,23,42,.38),0 8px 24px rgba(15,23,42,.12);animation:wmin .35s cubic-bezier(.2,.9,.3,1.15) both}.i{width:64px;height:64px;margin:0 auto 18px;border-radius:50%;background:#fff1f2;color:#e11d48;display:flex;align-items:center;justify-content:center}h2{margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:700;color:#111827}p{margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563}strong{color:#111827}button{appearance:none;-webkit-appearance:none;border:0;width:100%;padding:14px 18px;border-radius:12px;background:#4f46e5;color:#fff;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;transition:background .15s,transform .1s;box-shadow:0 6px 16px -4px rgba(79,70,229,.55)}button:hover{background:#4338ca}button:active{transform:scale(.98)}button:focus-visible{outline:3px solid #a5b4fc;outline-offset:2px}.g{display:flex;align-items:center;gap:10px;text-align:left;margin:-8px 0 22px;padding:12px 14px;border-radius:12px;background:#f3f4f6;font-size:13.5px;line-height:1.5;color:#374151}.g svg{flex-shrink:0}.f{margin-top:18px;font-size:11px;color:#9ca3af;letter-spacing:.4px;user-select:none}@media (prefers-color-scheme:dark){.c{background:#1c1f26;color:#e5e7eb;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 24px 64px -12px rgba(0,0,0,.75)}h2,strong{color:#f9fafb}p{color:#a1a7b3}.g{background:rgba(255,255,255,.06);color:#c7cbd3}.i{background:rgba(244,63,94,.15);color:#fb7185}.f{color:#6b7280}}@keyframes wmin{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.c{animation:none}}';
        var CHROME = '<svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#4285f4"/><path d="M24 2a22 22 0 0 1 19.05 11H24a11 11 0 0 0-9.53 5.5L5 12.1A22 22 0 0 1 24 2z" fill="#ea4335"/><path d="M5 12.1l9.47 6.4A11 11 0 0 0 24 35l-6.4 10.9A22 22 0 0 1 5 12.1z" fill="#34a853"/><path d="M43.05 13A22 22 0 0 1 17.6 45.9L24 35a11 11 0 0 0 9.53-16.5z" fill="#fbbc05"/><circle cx="24" cy="24" r="8.5" fill="#4285f4" stroke="#fff" stroke-width="3"/></svg>';
        var ICONO = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        function rnd() {
          return Math.random().toString(36).slice(2, 8);
        }
        function visible(el) {
          var cs = window.getComputedStyle(el);
          return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) >= 0.9 && cs.pointerEvents !== "none";
        }
        function muroActivo() {
          return host && document.documentElement.contains(host) && visible(host);
        }
        function bloquearScroll() {
          document.documentElement.style.setProperty("overflow", "hidden", "important");
          if (document.body) document.body.style.setProperty("overflow", "hidden", "important");
        }
        function wall() {
          if (muroActivo()) return;
          if (host) {
            recreados++;
            try {
              host.remove();
            } catch (e) {
            }
            if (recreados >= 3 && document.body) document.body.style.setProperty("visibility", "hidden", "important");
          }
          host = document.createElement("w" + rnd() + "-" + rnd());
          host.style.cssText = "all:initial!important;position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:16px!important;box-sizing:border-box!important;background:transparent!important;pointer-events:auto!important;visibility:visible!important;opacity:1!important;";
          var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
          root.innerHTML = "<style>" + CSS + '</style><div class="c" role="alertdialog" aria-modal="true" aria-labelledby="t" dir="' + (RTL ? "rtl" : "ltr") + '"><div class="i">' + ICONO + '</div><h2 id="t">' + TT.t + "</h2><p>" + TT.p + '</p><div class="g">' + CHROME + "<span>" + TT.c + '</span></div><button type="button">' + TT.b + '</button><div class="f">&copy; ' + (new Date()).getFullYear() + " " + dom() + "</div></div>";
          var btn = btnMuro = root.querySelector("button");
          btn.addEventListener("click", function() {
            location.reload();
          });
          document.documentElement.appendChild(host);
          bloquearScroll();
          try {
            btn.focus({ preventScroll: true });
          } catch (e) {
          }
          if (!focoAtrapado) {
            focoAtrapado = true;
            document.addEventListener("focusin", function(e) {
              if (host && btnMuro && e.target !== host) {
                try {
                  btnMuro.focus({ preventScroll: true });
                } catch (er) {
                }
              }
            }, true);
          }
          guard();
        }
        function guard() {
          if (!watcher) {
            watcher = new MutationObserver(function() {
              if (recreados < 3 && !muroActivo()) wall();
            });
            watcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
          }
          if (!backup) backup = setInterval(function() {
            if (!muroActivo()) wall();
            else bloquearScroll();
          }, 1e3);
        }
        if (navigator.brave && typeof navigator.brave.isBrave === "function") {
          navigator.brave.isBrave().then(function(b) {
            S.brave = !!b;
            log("brave");
            evaluar();
          }).catch(function() {
          });
        }
        var intentosAdsJs = 0, escuchandoOnline = false;
        function comprobarConexion(cb) {
          if (navigator.onLine === false) {
            cb(false);
            return;
          }
          try {
            fetch(location.href, { method: "HEAD", cache: "no-store" }).then(function() {
              cb(true);
            }).catch(function() {
              cb(false);
            });
          } catch (e) {
            cb(true);
          }
        }
        function fijarAdsJs(estado, motivo) {
          S.adsjs = estado;
          if (estado === "error-servidor") {
            try {
              console.warn("[WM-Shield] /ads.js no se sirve bien (" + motivo + "). No se muestra el muro. Revisa que tudominio.com/ads.js devuelva el archivo real.");
            } catch (e) {
            }
          } else {
            log("ads.js " + estado + " (" + motivo + ")");
          }
          evaluar();
        }
        function falloDeRed() {
          comprobarConexion(function(hayRed) {
            if (hayRed) {
              fijarAdsJs("bloqueado", "petición bloqueada");
              return;
            }
            S.adsjs = "sin-red";
            log("sin conexión: se pospone la detección");
            if (!escuchandoOnline) {
              escuchandoOnline = true;
              window.addEventListener("online", function() {
                intentosAdsJs = 0;
                probarAdsJs();
              });
            }
            evaluar();
          });
        }
        function diagnosticarAdsJs(cargo) {
          if (typeof fetch !== "function") {
            falloDeRed();
            return;
          }
          var r;
          fetch("/ads.js?_d=" + Date.now(), { cache: "no-store" }).then(function(res) {
            r = res;
            return res.text();
          }).then(function(txt) {
            var ct = (r.headers.get("content-type") || "").toLowerCase();
            var esJs = ct.indexOf("javascript") !== -1 || ct.indexOf("ecmascript") !== -1;
            if (!r.ok) fijarAdsJs("error-servidor", "HTTP " + r.status);
            else if (/^\s*</.test(txt)) fijarAdsJs("error-servidor", "devuelve HTML (¿fallback de la SPA?)");
            else if (!cargo && txt.indexOf("canRunAds") !== -1 && !esJs) fijarAdsJs("error-servidor", "Content-Type incorrecto: " + (ct || "vacío"));
            else fijarAdsJs("bloqueado", cargo ? "sustituido o variable anulada" : "script bloqueado");
          }, falloDeRed);
        }
        function probarAdsJs() {
          intentosAdsJs++;
          var terminado = false;
          try {
            window.canRunAds = false;
          } catch (e) {
          }
          if (window.canRunAds === true) {
            fijarAdsJs("bloqueado", "canRunAds forzada");
            return;
          }
          var s = document.createElement("script");
          s.async = true;
          s.src = "/ads.js?_=" + Date.now() + "-" + intentosAdsJs;
          var t = setTimeout(function() {
            if (terminado) return;
            terminado = true;
            if (intentosAdsJs < 2) {
              probarAdsJs();
              return;
            }
            S.adsjs = "inconcluso";
            log("ads.js inconcluso (red muy lenta)");
            evaluar();
          }, 6e3);
          s.onload = function() {
            if (terminado) return;
            terminado = true;
            clearTimeout(t);
            if (window.canRunAds === true) {
              S.adsjs = "ok";
              evaluar();
              return;
            }
            diagnosticarAdsJs(true);
          };
          s.onerror = function() {
            if (terminado) return;
            terminado = true;
            clearTimeout(t);
            if (intentosAdsJs < 2) {
              probarAdsJs();
              return;
            }
            diagnosticarAdsJs(false);
          };
          (document.head || document.documentElement).appendChild(s);
        }
        function vigilarGpt() {
          var t = setInterval(function() {
            if (window.__ADS_OK !== true) return;
            clearInterval(t);
            setTimeout(function() {
              if (!(window.googletag && window.googletag.apiReady)) {
                S.ceboRedFallos++;
                log("gpt.js de la web bloqueado");
                evaluar();
              }
            }, 8e3);
          }, 1e3);
        }
        var intentosCosmetico = 0;
        function ceboCosmetico() {
          if (!document.body) return;
          intentosCosmetico++;
          var pos = "position:absolute;top:-1000px;left:-1000px;width:10px;height:10px;";
          var ctl = document.createElement("div");
          ctl.setAttribute("aria-hidden", "true");
          ctl.innerHTML = "&nbsp;";
          ctl.style.cssText = pos;
          var c = document.createElement("div");
          c.className = "adsbox ad-placement doubleclick ad-placeholder adsense pub_300x250 banner-ad";
          c.setAttribute("aria-hidden", "true");
          c.innerHTML = "&nbsp;";
          c.style.cssText = pos;
          document.body.appendChild(ctl);
          document.body.appendChild(c);
          setTimeout(function() {
            var st = window.getComputedStyle(c);
            var oculto = c.offsetHeight === 0 || st.display === "none" || st.visibility === "hidden";
            var controlVisible = ctl.offsetHeight > 0;
            c.remove();
            ctl.remove();
            if (!controlVisible) {
              S.cosmetico = "inconcluso";
              if (intentosCosmetico < 4) setTimeout(ceboCosmetico, 1500);
            } else {
              S.cosmetico = oculto ? "oculto" : "ok";
            }
            log("cosmetico " + S.cosmetico);
            evaluar();
          }, 600);
        }
        function pulso(e) {
          var hoy = (new Date()).toISOString().slice(0, 10), k = "_wp" + hoy + e;
          try {
            if (localStorage.getItem(k)) return;
            localStorage.setItem(k, "1");
          } catch (er) {
          }
          try {
            if (navigator.sendBeacon) navigator.sendBeacon("/api/pulso", e);
            else fetch("/api/pulso", { method: "POST", body: e, keepalive: true });
          } catch (er) {
          }
        }
        function arrancar() {
          var cb = Date.now();
          setTimeout(function() {
            if (esBloqueador(S)) pulso("b");
            else if (S.adsjs === "ok" && S.cosmetico === "ok") pulso("v");
            else pulso("i");
          }, 1e4);
          probarAdsJs();
          vigilarGpt();
          setTimeout(ceboCosmetico, 100);
        }
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", arrancar);
        } else {
          arrancar();
        }
      })();
    