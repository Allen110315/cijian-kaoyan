/* Presentation only: no access to learning records or localStorage. */
'use strict';
(() => {
  const settings = document.getElementById('learningSettings');
  const mobile = window.matchMedia('(max-width:650px)');
  const adaptSettings = () => { settings.open = !mobile.matches; };
  adaptSettings();
  if (mobile.addEventListener) mobile.addEventListener('change', adaptSettings);
  else mobile.addListener(adaptSettings);

  const syncView = () => {
    const active = document.querySelector('.nav-item.active');
    document.body.dataset.view = active?.dataset.mode || 'study';
  };
  syncView();
  new MutationObserver(syncView).observe(document.getElementById('modeTitle'), {childList:true});
})();
