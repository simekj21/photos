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

  var currentPhotos = [];

  function loadPhotos() {
    return fetch("api/photos.php", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Nepodařilo se načíst fotky");
        return res.json();
      })
      .then(function (photos) {
        currentPhotos = photos;
        renderGallery(photos);
      })
      .catch(function () {
        document.getElementById("gallery").innerHTML = "";
      });
  }

  function renderGallery(photos) {
    var gallery = document.getElementById("gallery");
    gallery.innerHTML = "";
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
    document.getElementById("lb-image").src = photo.originalUrl;
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

  function setUploadStatus(text) {
    document.getElementById("upload-status").textContent = text;
  }

  function uploadFiles(fileList) {
    var files = Array.prototype.filter.call(fileList, function (file) {
      return file.type.indexOf("image/") === 0;
    });

    if (files.length === 0) {
      setUploadStatus("Vyberte prosím obrázky.");
      return;
    }

    var formData = new FormData();
    files.forEach(function (file) {
      formData.append("photos[]", file);
    });

    setUploadStatus("Nahrávám " + files.length + " " + (files.length === 1 ? "fotku" : "fotek") + "...");

    fetch("api/upload.php", { method: "POST", body: formData })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        var uploadedCount = (result.data.uploaded || []).length;
        var errorCount = (result.data.errors || []).length;

        if (uploadedCount > 0) {
          setUploadStatus("Nahráno: " + uploadedCount + (errorCount ? ", chyby: " + errorCount : ""));
          loadPhotos();
        } else {
          setUploadStatus("Nahrávání se nezdařilo: " + (result.data.error || "neznámá chyba"));
        }
      })
      .catch(function () {
        setUploadStatus("Nahrávání se nezdařilo. Zkuste to prosím znovu.");
      });
  }

  function initUpload() {
    var dropzone = document.getElementById("dropzone");
    var fileInput = document.getElementById("file-input");

    document.getElementById("pick-files").addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      if (fileInput.files.length > 0) {
        uploadFiles(fileInput.files);
        fileInput.value = "";
      }
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropzone.classList.add("dropzone--active");
      });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropzone.classList.remove("dropzone--active");
      });
    });

    dropzone.addEventListener("drop", function (event) {
      if (event.dataTransfer.files.length > 0) {
        uploadFiles(event.dataTransfer.files);
      }
    });

    var uploadToggle = document.getElementById("upload-toggle");
    uploadToggle.addEventListener("click", function () {
      var isHidden = dropzone.hidden;
      dropzone.hidden = !isHidden;
      uploadToggle.setAttribute("aria-expanded", String(isHidden));
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    initLightboxControls();
    initUpload();
    loadPhotos();
  });
})();
