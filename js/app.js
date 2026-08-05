(function () {
  "use strict";

  var THEME_KEY = "theme";
  var ADMIN_TOKEN_KEY = "adminToken";
  var adminMode = false;
  var adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || null;
  var selectedIds = new Set();
  var allTags = [];
  var activeFilterTagIds = new Set();
  var tagPickerSelection = new Set();
  var allEvents = [];
  var activeEventFilterId = null;
  var eventPickerSelectedId = null;
  var editingEventId = null;

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

  function adminFetch(url, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, adminToken ? { "X-Admin-Token": adminToken } : {});
    return fetch(url, options).then(function (res) {
      if (res.status === 401) {
        adminToken = null;
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        exitAdminMode();
        window.alert("Přihlášení do administrace vypršelo. Zadejte PIN znovu.");
      }
      return res;
    });
  }

  function enterAdminMode() {
    adminMode = true;
    document.getElementById("dropzone").hidden = false;
    document.getElementById("admin-tools").hidden = false;
    document.getElementById("admin-toggle").classList.add("icon-btn--admin-on");
    document.getElementById("admin-toggle").setAttribute("aria-expanded", "true");
    document.getElementById("events-toggle").classList.add("icon-btn--admin-hint");
    document.getElementById("events-add-btn").hidden = false;
    refreshDisplay();
    renderEventsList();
  }

  function exitAdminMode() {
    adminMode = false;
    document.getElementById("dropzone").hidden = true;
    document.getElementById("admin-tools").hidden = true;
    document.getElementById("admin-toggle").classList.remove("icon-btn--admin-on");
    document.getElementById("admin-toggle").setAttribute("aria-expanded", "false");
    document.getElementById("events-toggle").classList.remove("icon-btn--admin-hint");
    document.getElementById("events-add-btn").hidden = true;
    selectedIds.clear();
    updateBulkActions();
    refreshDisplay();
    renderEventsList();
  }

  function openAdminLogin() {
    document.getElementById("admin-pin-input").value = "";
    document.getElementById("admin-pin-error").hidden = true;
    document.getElementById("admin-login").hidden = false;
    document.getElementById("admin-pin-input").focus();
  }

  function closeAdminLogin() {
    document.getElementById("admin-login").hidden = true;
  }

  function submitAdminPin() {
    var pin = document.getElementById("admin-pin-input").value.trim();
    if (!pin) return;

    fetch("api/auth.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          document.getElementById("admin-pin-error").textContent = result.data.error || "Nesprávný PIN";
          document.getElementById("admin-pin-error").hidden = false;
          return;
        }
        adminToken = result.data.token;
        localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
        closeAdminLogin();
        enterAdminMode();
      })
      .catch(function () {
        document.getElementById("admin-pin-error").textContent = "Ověření selhalo. Zkuste to prosím znovu.";
        document.getElementById("admin-pin-error").hidden = false;
      });
  }

  function initAdminLogin() {
    document.getElementById("admin-pin-cancel").addEventListener("click", closeAdminLogin);
    document.getElementById("admin-pin-submit").addEventListener("click", submitAdminPin);
    document.getElementById("admin-login").addEventListener("click", function (event) {
      if (event.target.id === "admin-login") closeAdminLogin();
    });
    document.getElementById("admin-pin-input").addEventListener("keydown", function (event) {
      if (event.key === "Enter") submitAdminPin();
    });
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

  function loadEvents() {
    return fetch("api/events.php", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Nepodařilo se načíst akce");
        return res.json();
      })
      .then(function (events) {
        allEvents = events;
        renderEventsList();
      })
      .catch(function () {
        allEvents = [];
        renderEventsList();
      });
  }

  function getFilteredPhotos() {
    return currentPhotos.filter(function (photo) {
      var matchesTags =
        activeFilterTagIds.size === 0 ||
        (photo.tagIds || []).some(function (id) {
          return activeFilterTagIds.has(id);
        });
      var matchesEvent = !activeEventFilterId || photo.eventId === activeEventFilterId;
      return matchesTags && matchesEvent;
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

    adminFetch("api/delete.php", {
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

    adminFetch("api/delete.php", {
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
      if (!document.getElementById("event-picker").hidden) closeEventPicker();
      if (!document.getElementById("event-editor").hidden) closeEventEditor();
      if (!document.getElementById("events-panel").hidden) document.getElementById("events-panel").hidden = true;
      if (!document.getElementById("admin-login").hidden) closeAdminLogin();
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

    adminFetch("api/upload.php", { method: "POST", body: formData })
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
    adminToggle.addEventListener("click", function () {
      if (adminMode) {
        exitAdminMode();
        return;
      }
      if (adminToken) {
        enterAdminMode();
      } else {
        openAdminLogin();
      }
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
    return adminFetch("api/tags.php", {
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

      adminFetch("api/photo-tags.php", {
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

        adminFetch("api/tags.php", {
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

        adminFetch("api/tags.php", {
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

  function formatEventDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return parseInt(parts[2], 10) + ". " + parseInt(parts[1], 10) + ". " + parts[0];
  }

  function formatEventRange(startDate, endDate) {
    var start = formatEventDate(startDate);
    if (!endDate || endDate === startDate) return start;
    return start + " – " + formatEventDate(endDate);
  }

  function renderEventsList() {
    var container = document.getElementById("events-list");
    var empty = document.getElementById("events-empty");
    container.innerHTML = "";
    empty.hidden = allEvents.length > 0;
    container.hidden = allEvents.length === 0;

    allEvents.forEach(function (evt) {
      var row = document.createElement("div");
      row.className = "event-row";

      var selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "event-row__select" + (activeEventFilterId === evt.id ? " event-row__select--active" : "");
      selectBtn.innerHTML =
        '<span class="event-row__name"></span><span class="event-row__dates"></span>';
      selectBtn.querySelector(".event-row__name").textContent = evt.name;
      selectBtn.querySelector(".event-row__dates").textContent = formatEventRange(evt.startDate, evt.endDate);
      selectBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        activeEventFilterId = activeEventFilterId === evt.id ? null : evt.id;
        renderEventsList();
        refreshDisplay();
      });
      row.appendChild(selectBtn);

      if (adminMode) {
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-btn";
        editBtn.setAttribute("aria-label", "Upravit akci " + evt.name);
        editBtn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        editBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openEventEditor(evt);
        });
        row.appendChild(editBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "icon-btn";
        deleteBtn.setAttribute("aria-label", "Smazat akci " + evt.name);
        deleteBtn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>';
        deleteBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          deleteEvent(evt.id);
        });
        row.appendChild(deleteBtn);
      }

      container.appendChild(row);
    });
  }

  function deleteEvent(id) {
    if (!window.confirm("Opravdu smazat tuto akci? Fotky o ni přijdou.")) return;

    adminFetch("api/events.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: id }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          window.alert("Smazání akce selhalo: " + (result.data.error || "neznámá chyba"));
          return;
        }
        if (activeEventFilterId === id) activeEventFilterId = null;
        loadEvents();
        loadPhotos();
      });
  }

  function openEventEditor(evt) {
    editingEventId = evt ? evt.id : null;
    document.getElementById("event-editor-title").textContent = evt ? "Upravit akci" : "Přidat akci";
    document.getElementById("event-name").value = evt ? evt.name : "";
    document.getElementById("event-location").value = evt ? evt.location || "" : "";
    document.getElementById("event-description").value = evt ? evt.description || "" : "";
    document.getElementById("event-participants").value = evt ? evt.participants || "" : "";
    document.getElementById("event-start").value = evt ? evt.startDate : "";

    var dateMode = !!(evt && evt.endDate);
    document.querySelector('input[name="event-end-mode"][value="' + (dateMode ? "date" : "days") + '"]').checked = true;
    document.getElementById("event-days").value = "1";
    document.getElementById("event-end").value = evt && evt.endDate ? evt.endDate : "";
    updateEventEndModeVisibility();

    document.getElementById("event-editor").hidden = false;
  }

  function closeEventEditor() {
    document.getElementById("event-editor").hidden = true;
  }

  function updateEventEndModeVisibility() {
    var mode = document.querySelector('input[name="event-end-mode"]:checked').value;
    document.getElementById("event-days").hidden = mode !== "days";
    document.getElementById("event-end").hidden = mode !== "date";
  }

  function saveEvent() {
    var name = document.getElementById("event-name").value.trim();
    var startDate = document.getElementById("event-start").value;
    if (!name || !startDate) {
      window.alert("Vyplňte prosím jméno a začátek akce.");
      return;
    }

    var endMode = document.querySelector('input[name="event-end-mode"]:checked').value;
    var payload = {
      action: editingEventId ? "update" : "create",
      id: editingEventId,
      name: name,
      location: document.getElementById("event-location").value.trim(),
      description: document.getElementById("event-description").value.trim(),
      participants: document.getElementById("event-participants").value.trim(),
      startDate: startDate,
      endMode: endMode,
      days: document.getElementById("event-days").value,
      endDate: document.getElementById("event-end").value,
    };

    adminFetch("api/events.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          window.alert("Uložení akce selhalo: " + (result.data.error || "neznámá chyba"));
          return;
        }
        closeEventEditor();
        loadEvents();
      });
  }

  function initEventEditor() {
    document.getElementById("events-add-btn").addEventListener("click", function () {
      openEventEditor(null);
    });
    document.getElementById("event-editor-cancel").addEventListener("click", closeEventEditor);
    document.getElementById("event-editor-save").addEventListener("click", saveEvent);
    document.getElementById("event-editor").addEventListener("click", function (event) {
      if (event.target.id === "event-editor") closeEventEditor();
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="event-end-mode"]'), function (radio) {
      radio.addEventListener("change", updateEventEndModeVisibility);
    });
  }

  function renderEventPickerList() {
    var container = document.getElementById("event-picker-list");
    var empty = document.getElementById("event-picker-empty");
    container.innerHTML = "";
    empty.hidden = allEvents.length > 0;

    allEvents.forEach(function (evt) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip" + (eventPickerSelectedId === evt.id ? " tag-chip--active" : "");
      chip.textContent = evt.name;
      chip.addEventListener("click", function () {
        eventPickerSelectedId = eventPickerSelectedId === evt.id ? null : evt.id;
        renderEventPickerList();
      });
      container.appendChild(chip);
    });
  }

  function openEventPicker() {
    eventPickerSelectedId = null;
    renderEventPickerList();
    document.getElementById("event-picker").hidden = false;
  }

  function closeEventPicker() {
    document.getElementById("event-picker").hidden = true;
  }

  function initEventPicker() {
    document.getElementById("bulk-event").addEventListener("click", openEventPicker);
    document.getElementById("event-picker-cancel").addEventListener("click", closeEventPicker);
    document.getElementById("event-picker").addEventListener("click", function (event) {
      if (event.target.id === "event-picker") closeEventPicker();
    });

    document.getElementById("event-picker-apply").addEventListener("click", function () {
      if (!eventPickerSelectedId) {
        window.alert("Vyberte akci.");
        return;
      }

      adminFetch("api/photo-events.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedIds), eventId: eventPickerSelectedId }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            window.alert("Přiřazení akce selhalo: " + (result.data.error || "neznámá chyba"));
            return;
          }
          closeEventPicker();
          selectedIds.clear();
          updateBulkActions();
          loadPhotos();
        })
        .catch(function () {
          window.alert("Přiřazení akce selhalo. Zkuste to prosím znovu.");
        });
    });
  }

  function initEventsPanel() {
    var eventsToggle = document.getElementById("events-toggle");
    var eventsPanel = document.getElementById("events-panel");

    eventsToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      var willOpen = eventsPanel.hidden;
      eventsPanel.hidden = !willOpen;
      eventsToggle.setAttribute("aria-expanded", String(willOpen));
    });

    document.addEventListener("click", function (event) {
      if (!eventsPanel.hidden && !eventsPanel.contains(event.target) && event.target !== eventsToggle) {
        eventsPanel.hidden = true;
        eventsToggle.setAttribute("aria-expanded", "false");
      }
    });

    document.getElementById("events-filter-clear").addEventListener("click", function () {
      activeEventFilterId = null;
      renderEventsList();
      refreshDisplay();
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
    initEventsPanel();
    initEventEditor();
    initEventPicker();
    initAdminLogin();
    loadPhotos();
    loadTags();
    loadEvents();
  });
})();
