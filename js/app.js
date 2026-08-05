(function () {
  "use strict";

  var THEME_KEY = "theme";
  var adminMode = false;
  var selectedIds = new Set();
  var allTags = [];
  var activeFilterTagIds = new Set();
  var tagPickerSelection = new Set();

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

  function pluralizePhotos(count) {
    if (count === 1) return count + " fotka";
    if (count >= 2 && count <= 4) return count + " fotky";
    return count + " fotek";
  }

  function loadPhotos() {
    return fetch("api/photos.php", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Nepodařilo se načíst fotky");
        return res.json();
      })
      .then(function (photos) {
        currentPhotos = photos;
        document.getElementById("photo-count").textContent = pluralizePhotos(photos.length);
        refreshDisplay();
      })
      .catch(function () {
        document.getElementById("gallery").innerHTML = "";
        document.getElementById("photo-count").textContent = "";
      });
  }

  function loadTags() {
    return fetch("api/tags.php", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Nepodařilo se načíst tagy");
        return res.json();
      })
      .then(function (tags) {
        allTags = tags;
        renderFilterChips();
      })
      .catch(function () {
        allTags = [];
        renderFilterChips();
      });
  }

  function getFilteredPhotos() {
    if (activeFilterTagIds.size === 0) return currentPhotos;
    return currentPhotos.filter(function (photo) {
      return (photo.tagIds || []).some(function (id) {
        return activeFilterTagIds.has(id);
      });
    });
  }

  function refreshDisplay() {
    renderGallery(getFilteredPhotos());
  }

  function renderGallery(photos) {
    var gallery = document.getElementById("gallery");
    gallery.innerHTML = "";
    var fragment = document.createDocumentFragment();

    photos.forEach(function (photo, index) {
      var tile = document.createElement("div");
      tile.className = "tile";

      var openBtn = document.createElement("button");
      openBtn.className = "tile__open";
      openBtn.style.cssText = "position:absolute; inset:0; width:100%; height:100%; border:0; padding:0; background:transparent; cursor:pointer;";
      openBtn.setAttribute("aria-label", "Otevřít fotku " + (index + 1));

      var img = document.createElement("img");
      img.src = photo.thumbUrl;
      img.loading = "lazy";
      img.alt = "";
      openBtn.appendChild(img);

      openBtn.addEventListener("click", function () {
        if (adminMode) {
          toggleSelect(photo.id, tile);
          var cb = tile.querySelector(".tile__select");
          if (cb) cb.checked = selectedIds.has(photo.id);
          return;
        }
        openLightbox(photos, index);
      });

      tile.appendChild(openBtn);

      if (adminMode) {
        if (selectedIds.has(photo.id)) {
          tile.classList.add("tile--selected");
        }

        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "tile__select";
        checkbox.setAttribute("aria-label", "Vybrat fotku " + (index + 1));
        checkbox.checked = selectedIds.has(photo.id);
        checkbox.addEventListener("click", function (event) {
          event.stopPropagation();
        });
        checkbox.addEventListener("change", function () {
          toggleSelect(photo.id, tile);
        });
        tile.appendChild(checkbox);

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "icon-btn tile__delete";
        deleteBtn.setAttribute("aria-label", "Smazat fotku " + (index + 1));
        deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>';
        deleteBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          deletePhoto(photo.id);
        });
        tile.appendChild(deleteBtn);
      }

      fragment.appendChild(tile);
    });

    gallery.appendChild(fragment);
  }

  function toggleSelect(id, tile) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
      tile.classList.remove("tile--selected");
    } else {
      selectedIds.add(id);
      tile.classList.add("tile--selected");
    }
    updateBulkActions();
  }

  function clearSelection() {
    selectedIds.clear();
    updateBulkActions();
    refreshDisplay();
  }

  function updateBulkActions() {
    var bar = document.getElementById("bulk-actions");
    var count = selectedIds.size;
    bar.hidden = count === 0;
    document.getElementById("bulk-count").textContent =
      count + " " + (count === 1 ? "vybraná fotka" : count < 5 ? "vybrané fotky" : "vybraných fotek");
  }

  function bulkDeletePhotos() {
    var ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm("Opravdu smazat " + ids.length + " fotek?")) return;

    fetch("api/delete.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          selectedIds.clear();
          updateBulkActions();
          loadPhotos();
        } else {
          window.alert("Smazání se nezdařilo: " + (result.data.error || "neznámá chyba"));
        }
      })
      .catch(function () {
        window.alert("Smazání se nezdařilo. Zkuste to prosím znovu.");
      });
  }

  function deletePhoto(id) {
    if (!window.confirm("Opravdu smazat tuto fotku?")) return;

    fetch("api/delete.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          if (!document.getElementById("lightbox").hidden) {
            closeLightbox();
          }
          loadPhotos();
        } else {
          window.alert("Smazání se nezdařilo: " + (result.data.error || "neznámá chyba"));
        }
      })
      .catch(function () {
        window.alert("Smazání se nezdařilo. Zkuste to prosím znovu.");
      });
  }

  var lightboxState = { photos: [], index: 0 };

  function openLightbox(photos, index) {
    lightboxState.photos = photos;
    lightboxState.index = index;
    updateLightboxImage();
    document.getElementById("lb-delete").hidden = !adminMode;
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
    document.getElementById("lb-delete").addEventListener("click", function () {
      var photo = lightboxState.photos[lightboxState.index];
      deletePhoto(photo.id);
    });

    document.getElementById("lightbox").addEventListener("click", function (event) {
      if (event.target.id === "lightbox") {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") {
        if (!document.getElementById("lightbox").hidden) {
          if (event.key === "ArrowRight") showNext();
          if (event.key === "ArrowLeft") showPrev();
        }
        return;
      }
      if (!document.getElementById("lightbox").hidden) closeLightbox();
      if (!document.getElementById("tag-picker").hidden) closeTagPicker();
      if (!document.getElementById("tag-manager").hidden) closeTagManager();
      if (!document.getElementById("filter-panel").hidden) document.getElementById("filter-panel").hidden = true;
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

    var adminToggle = document.getElementById("admin-toggle");
    var adminTools = document.getElementById("admin-tools");
    adminToggle.addEventListener("click", function () {
      adminMode = !adminMode;
      dropzone.hidden = !adminMode;
      adminTools.hidden = !adminMode;
      adminToggle.setAttribute("aria-expanded", String(adminMode));
      if (!adminMode) {
        selectedIds.clear();
        updateBulkActions();
      }
      refreshDisplay();
    });

    document.getElementById("bulk-clear").addEventListener("click", clearSelection);
    document.getElementById("bulk-delete").addEventListener("click", bulkDeletePhotos);
    document.getElementById("bulk-tag").addEventListener("click", openTagPicker);
    document.getElementById("manage-tags-btn").addEventListener("click", openTagManager);
  }

  function renderFilterChips() {
    var container = document.getElementById("filter-tags");
    var empty = document.getElementById("filter-empty");
    container.innerHTML = "";
    empty.hidden = allTags.length > 0;

    allTags.forEach(function (tag) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip" + (activeFilterTagIds.has(tag.id) ? " tag-chip--active" : "");
      chip.textContent = tag.name;
      chip.addEventListener("click", function (event) {
        event.stopPropagation();
        if (activeFilterTagIds.has(tag.id)) {
          activeFilterTagIds.delete(tag.id);
        } else {
          activeFilterTagIds.add(tag.id);
        }
        document.getElementById("filter-toggle").classList.toggle("icon-btn--active", activeFilterTagIds.size > 0);
        renderFilterChips();
        refreshDisplay();
      });
      container.appendChild(chip);
    });
  }

  function initFilter() {
    var filterToggle = document.getElementById("filter-toggle");
    var filterPanel = document.getElementById("filter-panel");

    filterToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      var willOpen = filterPanel.hidden;
      filterPanel.hidden = !willOpen;
      filterToggle.setAttribute("aria-expanded", String(willOpen));
    });

    document.addEventListener("click", function (event) {
      if (!filterPanel.hidden && !filterPanel.contains(event.target) && event.target !== filterToggle) {
        filterPanel.hidden = true;
        filterToggle.setAttribute("aria-expanded", "false");
      }
    });

    document.getElementById("filter-clear").addEventListener("click", function () {
      activeFilterTagIds.clear();
      filterToggle.classList.remove("icon-btn--active");
      renderFilterChips();
      refreshDisplay();
    });
  }

  function renderTagPickerChips() {
    var container = document.getElementById("tag-picker-list");
    var empty = document.getElementById("tag-picker-empty");
    container.innerHTML = "";
    empty.hidden = allTags.length > 0;

    allTags.forEach(function (tag) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip" + (tagPickerSelection.has(tag.id) ? " tag-chip--active" : "");
      chip.textContent = tag.name;
      chip.addEventListener("click", function () {
        if (tagPickerSelection.has(tag.id)) {
          tagPickerSelection.delete(tag.id);
        } else {
          tagPickerSelection.add(tag.id);
        }
        renderTagPickerChips();
      });
      container.appendChild(chip);
    });
  }

  function openTagPicker() {
    tagPickerSelection = new Set();
    renderTagPickerChips();
    document.getElementById("tag-picker-input").value = "";
    document.getElementById("tag-picker").hidden = false;
  }

  function closeTagPicker() {
    document.getElementById("tag-picker").hidden = true;
  }

  function createTag(name) {
    return fetch("api/tags.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: name }),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  }

  function initTagPicker() {
    document.getElementById("tag-picker-cancel").addEventListener("click", closeTagPicker);

    document.getElementById("tag-picker").addEventListener("click", function (event) {
      if (event.target.id === "tag-picker") closeTagPicker();
    });

    document.getElementById("tag-picker-add").addEventListener("click", function () {
      var input = document.getElementById("tag-picker-input");
      var name = input.value.trim();
      if (!name) return;

      createTag(name).then(function (result) {
        if (!result.ok) {
          window.alert("Vytvoření tagu selhalo: " + (result.data.error || "neznámá chyba"));
          return;
        }
        allTags.push(result.data);
        tagPickerSelection.add(result.data.id);
        renderTagPickerChips();
        renderFilterChips();
        input.value = "";
      });
    });

    document.getElementById("tag-picker-apply").addEventListener("click", function () {
      var tagIds = Array.from(tagPickerSelection);
      if (tagIds.length === 0) {
        window.alert("Vyberte alespoň jeden tag.");
        return;
      }

      fetch("api/photo-tags.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedIds), tagIds: tagIds }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            window.alert("Přiřazení tagů selhalo: " + (result.data.error || "neznámá chyba"));
            return;
          }
          closeTagPicker();
          selectedIds.clear();
          updateBulkActions();
          loadPhotos();
        })
        .catch(function () {
          window.alert("Přiřazení tagů selhalo. Zkuste to prosím znovu.");
        });
    });
  }

  function renderTagManagerList() {
    var container = document.getElementById("tag-manager-list");
    var empty = document.getElementById("tag-manager-empty");
    container.innerHTML = "";
    empty.hidden = allTags.length > 0;

    allTags.forEach(function (tag) {
      var row = document.createElement("div");
      row.className = "tag-manager-row";

      var input = document.createElement("input");
      input.type = "text";
      input.className = "input";
      input.value = tag.name;

      var saveBtn = document.createElement("button");
      saveBtn.className = "icon-btn";
      saveBtn.setAttribute("aria-label", "Uložit název tagu");
      saveBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>';
      saveBtn.addEventListener("click", function () {
        var newName = input.value.trim();
        if (!newName || newName === tag.name) return;

        fetch("api/tags.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename", id: tag.id, name: newName }),
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { ok: res.ok, data: data };
            });
          })
          .then(function (result) {
            if (!result.ok) {
              window.alert("Přejmenování selhalo: " + (result.data.error || "neznámá chyba"));
              return;
            }
            tag.name = newName;
            renderFilterChips();
          });
      });

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "icon-btn";
      deleteBtn.setAttribute("aria-label", "Smazat tag " + tag.name);
      deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>';
      deleteBtn.addEventListener("click", function () {
        if (!window.confirm('Opravdu smazat tag "' + tag.name + '"? Odebere se ze všech fotek.')) return;

        fetch("api/tags.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id: tag.id }),
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { ok: res.ok, data: data };
            });
          })
          .then(function (result) {
            if (!result.ok) {
              window.alert("Smazání tagu selhalo: " + (result.data.error || "neznámá chyba"));
              return;
            }
            allTags = allTags.filter(function (t) {
              return t.id !== tag.id;
            });
            activeFilterTagIds.delete(tag.id);
            renderTagManagerList();
            renderFilterChips();
            loadPhotos();
          });
      });

      row.appendChild(input);
      row.appendChild(saveBtn);
      row.appendChild(deleteBtn);
      container.appendChild(row);
    });
  }

  function openTagManager() {
    renderTagManagerList();
    document.getElementById("tag-manager-input").value = "";
    document.getElementById("tag-manager").hidden = false;
  }

  function closeTagManager() {
    document.getElementById("tag-manager").hidden = true;
  }

  function initTagManager() {
    document.getElementById("tag-manager-close").addEventListener("click", closeTagManager);

    document.getElementById("tag-manager").addEventListener("click", function (event) {
      if (event.target.id === "tag-manager") closeTagManager();
    });

    document.getElementById("tag-manager-add").addEventListener("click", function () {
      var input = document.getElementById("tag-manager-input");
      var name = input.value.trim();
      if (!name) return;

      createTag(name).then(function (result) {
        if (!result.ok) {
          window.alert("Vytvoření tagu selhalo: " + (result.data.error || "neznámá chyba"));
          return;
        }
        allTags.push(result.data);
        renderTagManagerList();
        renderFilterChips();
        input.value = "";
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    initLightboxControls();
    initUpload();
    initFilter();
    initTagPicker();
    initTagManager();
    loadPhotos();
    loadTags();
  });
})();
