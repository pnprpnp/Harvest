window.__harvestnaviWelcomePaintAt = Date.now();
window.__harvestnaviWelcomeHasPainted = false;
requestAnimationFrame(function(){
  window.__harvestnaviWelcomePaintAt = Date.now();
  window.__harvestnaviWelcomeHasPainted = true;
});
