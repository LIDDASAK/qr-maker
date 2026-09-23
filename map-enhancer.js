(function () {
  "use strict";

  function findScope() {
    if (!window.angular) return null;
    var element = document.querySelector(".qrcode-generator");
    if (!element) return null;
    var wrapped = window.angular.element(element);
    return wrapped.scope() || wrapped.isolateScope();
  }

  function updateCoordinates(scope, latitude, longitude) {
    scope.$evalAsync(function () {
      scope.qrcode.data.mapsLatitude = Number(latitude.toFixed(6));
      scope.qrcode.data.mapsLongitude = Number(longitude.toFixed(6));
      if (typeof scope.createLocalQr === "function") {
        scope.createLocalQr();
      }
    });
  }

  function searchAddress(scope, query) {
    if (!query || query.trim().length < 3) {
      scope.locationSearchResults = [];
      return;
    }
    var requestId = (scope.locationSearchRequestId || 0) + 1;
    scope.locationSearchRequestId = requestId;
    fetch(
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=" +
        encodeURIComponent(query.trim()),
      { headers: { Accept: "application/json" } },
    )
      .then(function (response) {
        if (!response.ok) throw new Error("Address search failed");
        return response.json();
      })
      .then(function (results) {
        if (scope.locationSearchRequestId !== requestId) return;
        scope.$evalAsync(function () {
          scope.locationSearchResults = results;
        });
      })
      .catch(function () {
        if (scope.locationSearchRequestId === requestId) {
          scope.$evalAsync(function () {
            scope.locationSearchResults = [];
          });
        }
      });
  }

  function selectLocationResult(scope, map, marker, result) {
    var latitude = Number(result.lat);
    var longitude = Number(result.lon);
    scope.$evalAsync(function () {
      scope.mapsSearch = result.display_name;
      scope.locationSearchResults = [];
      scope.qrcode.data.mapsLatitude = Number(latitude.toFixed(6));
      scope.qrcode.data.mapsLongitude = Number(longitude.toFixed(6));
    });
    marker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], 16);
    if (typeof scope.createLocalQr === "function") scope.createLocalQr();
  }

  function attach(scope) {
    var mapElement = document.getElementById("map");
    if (!mapElement || mapElement.__leafletMap || !window.L) return;

    var latitude = Number(scope.qrcode.data.mapsLatitude) || 17.97064;
    var longitude = Number(scope.qrcode.data.mapsLongitude) || 102.618607;
    scope.locationSearchResults = [];
    var map = window.L.map(mapElement).setView([latitude, longitude], 5);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    var marker = window.L.marker([latitude, longitude], {
      draggable: true,
    }).addTo(map);
    marker.on("dragend", function () {
      var position = marker.getLatLng();
      updateCoordinates(scope, position.lat, position.lng);
    });
    map.on("click", function (event) {
      marker.setLatLng(event.latlng);
      updateCoordinates(scope, event.latlng.lat, event.latlng.lng);
    });

    mapElement.__leafletMap = map;
    mapElement.__leafletMarker = marker;
    var searchInput = document.getElementById("location-address-search");
    var searchTimer = null;
    scope.selectLocationResult = function (result) {
      selectLocationResult(scope, map, marker, result);
    };
    if (searchInput && !searchInput.__locationSearchBound) {
      searchInput.__locationSearchBound = true;
      searchInput.addEventListener("input", function () {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () {
          searchAddress(scope, searchInput.value);
        }, 350);
      });
    }
    window.setTimeout(function () {
      map.invalidateSize();
    }, 100);
  }

  var tries = 0;
  var timer = window.setInterval(function () {
    var scope = findScope();
    if (scope && window.L && scope.qrcode && scope.qrcode.type === "maps") {
      window.clearInterval(timer);
      attach(scope);
    } else if (++tries > 200) {
      window.clearInterval(timer);
    }
  }, 100);
})();
