const { response } = require("express");

function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 13.819161752429082, lng: 100.04126661117972 },
    zoom: 13
  });

  // 2. Create InfoWindow
  const infoWindow = new google.maps.InfoWindow();

  // 3. Example WC data (hardcoded)
  fetch('http://localhost:3000/wc')
  .then(response => response.json())
  .then(wcData =>{
    // 4. Loop through and create markers
    wcData.forEach(wc => {
    const marker = new google.maps.Marker({
      position: { lat: wc.lat, lng: wc.lng },
      map: map,
      title: wc.building
    });

    // 5. Click marker to show popup
    marker.addListener("click", () => {
      infoWindow.setContent(`
        <h3>${wc.building}</h3>
        <p>Floor: ${wc.floor}</p>
        <p> ${wc.note}</p>
        <p>Hours: ${wc.operatingHours}</p>
      `);
      infoWindow.open(map, marker);
    });
  });
  })

}

