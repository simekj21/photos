(function () {
  "use strict";

  var THEME_KEY = "theme";

  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    var theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(theme);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  }

  // Docasna demo data - az bude hotove API (api/photos.php), nahradi se fetch()em.
  function getDemoPhotos() {
    var photos = [];
    for (var i = 1; i <= 24; i++) {
      photos.push({
        id: i,
        thumbUrl: "https://picsum.photos/seed/photo" + i + "/400/400",
        fullUrl: "https://picsum.photos/seed/photo" + i + "/1600/1600",
      });
    }
    return photos;
  }

  function renderGallery(photos) {
    var gallery = document.getElementById("gallery");
    var fragment = document.createDocumentFragment();

    photos.forEach(function (photo, index) {
      var tile = document.createElement("button");
      tile.className = "tile";
      tile.setAttribute("aria-label", "Otevřít fotku " + (index + 1));

      var img = document.createElement("img");
      img.src = photo.thumbUrl;
      img.loading = "lazy";
      img.alt = "";
      tile.appendChild(img);

      tile.addEventListener("click", function () {
        openLightbox(photos, index);
      });

      fragment.appendChild(tile);
    });

    gallery.appendChild(fragment);
  }

  var lightboxState = { photos: [], index: 0 };

  function openLightbox(photos, index) {
    lightboxState.photos = photos;
    lightboxState.index = index;
    updateLightboxImage();
    document.getElementById("lightbox").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    document.getElementById("lightbox").hidden = true;
    document.body.style.overflow = "";
  }

  function showNext() {
    lightboxState.index = (lightboxState.index + 1) % lightboxState.photos.length;
    updateLightboxImage();
  }

  function showPrev() {
    lightboxState.index = (lightboxState.index - 1 + lightboxState.photos.length) % lightboxState.photos.length;
    updateLightboxImage();
  }

  function updateLightboxImage() {
    var photo = lightboxState.photos[lightboxState.index];
    document.getElementById("lb-image").src = photo.fullUrl;
  }

  function initLightboxControls() {
    document.getElementById("lb-close").addEventListener("click", closeLightbox);
    document.getElementById("lb-next").addEventListener("click", showNext);
    document.getElementById("lb-prev").addEventListener("click", showPrev);

    document.getElementById("lightbox").addEventListener("click", function (event) {
      if (event.target.id === "lightbox") {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (document.getElementById("lightbox").hidden) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowRight") showNext();
      if (event.key === "ArrowLeft") showPrev();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    initLightboxControls();
    renderGallery(getDemoPhotos());
  });
})();
