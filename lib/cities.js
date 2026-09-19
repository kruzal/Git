// Birth places with coordinates and IANA time zones. Extend as needed.
const CITIES = [
  ['Delhi', 'India', 28.6139, 77.209, 'Asia/Kolkata'],
  ['Mumbai', 'India', 19.076, 72.8777, 'Asia/Kolkata'],
  ['Bengaluru', 'India', 12.9716, 77.5946, 'Asia/Kolkata'],
  ['Chennai', 'India', 13.0827, 80.2707, 'Asia/Kolkata'],
  ['Kolkata', 'India', 22.5726, 88.3639, 'Asia/Kolkata'],
  ['Hyderabad', 'India', 17.385, 78.4867, 'Asia/Kolkata'],
  ['Pune', 'India', 18.5204, 73.8567, 'Asia/Kolkata'],
  ['Ahmedabad', 'India', 23.0225, 72.5714, 'Asia/Kolkata'],
  ['Jaipur', 'India', 26.9124, 75.7873, 'Asia/Kolkata'],
  ['Lucknow', 'India', 26.8467, 80.9462, 'Asia/Kolkata'],
  ['Kanpur', 'India', 26.4499, 80.3319, 'Asia/Kolkata'],
  ['Patna', 'India', 25.5941, 85.1376, 'Asia/Kolkata'],
  ['Varanasi', 'India', 25.3176, 82.9739, 'Asia/Kolkata'],
  ['Bhopal', 'India', 23.2599, 77.4126, 'Asia/Kolkata'],
  ['Indore', 'India', 22.7196, 75.8577, 'Asia/Kolkata'],
  ['Nagpur', 'India', 21.1458, 79.0882, 'Asia/Kolkata'],
  ['Surat', 'India', 21.1702, 72.8311, 'Asia/Kolkata'],
  ['Chandigarh', 'India', 30.7333, 76.7794, 'Asia/Kolkata'],
  ['Amritsar', 'India', 31.634, 74.8723, 'Asia/Kolkata'],
  ['Dehradun', 'India', 30.3165, 78.0322, 'Asia/Kolkata'],
  ['Guwahati', 'India', 26.1445, 91.7362, 'Asia/Kolkata'],
  ['Bhubaneswar', 'India', 20.2961, 85.8245, 'Asia/Kolkata'],
  ['Kochi', 'India', 9.9312, 76.2673, 'Asia/Kolkata'],
  ['Thiruvananthapuram', 'India', 8.5241, 76.9366, 'Asia/Kolkata'],
  ['Coimbatore', 'India', 11.0168, 76.9558, 'Asia/Kolkata'],
  ['Mysuru', 'India', 12.2958, 76.6394, 'Asia/Kolkata'],
  ['Visakhapatnam', 'India', 17.6868, 83.2185, 'Asia/Kolkata'],
  ['Raipur', 'India', 21.2514, 81.6296, 'Asia/Kolkata'],
  ['Ranchi', 'India', 23.3441, 85.3096, 'Asia/Kolkata'],
  ['Srinagar', 'India', 34.0837, 74.7973, 'Asia/Kolkata'],
  ['Kathmandu', 'Nepal', 27.7172, 85.324, 'Asia/Kathmandu'],
  ['Dhaka', 'Bangladesh', 23.8103, 90.4125, 'Asia/Dhaka'],
  ['Colombo', 'Sri Lanka', 6.9271, 79.8612, 'Asia/Colombo'],
  ['Karachi', 'Pakistan', 24.8607, 67.0011, 'Asia/Karachi'],
  ['Dubai', 'UAE', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Singapore', 'Singapore', 1.3521, 103.8198, 'Asia/Singapore'],
  ['Tokyo', 'Japan', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Sydney', 'Australia', -33.8688, 151.2093, 'Australia/Sydney'],
  ['London', 'UK', 51.5074, -0.1278, 'Europe/London'],
  ['Paris', 'France', 48.8566, 2.3522, 'Europe/Paris'],
  ['Berlin', 'Germany', 52.52, 13.405, 'Europe/Berlin'],
  ['New York', 'USA', 40.7128, -74.006, 'America/New_York'],
  ['Chicago', 'USA', 41.8781, -87.6298, 'America/Chicago'],
  ['Los Angeles', 'USA', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['Toronto', 'Canada', 43.6532, -79.3832, 'America/Toronto'],
].map(([name, country, lat, lon, tz]) => ({ name, country, lat, lon, tz }));

// Converts a local wall-clock time in a time zone to a UTC Date (handles historical offsets via Intl).
function localToUtc(dateStr, timeStr, tz) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const offsetAt = (instant) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(instant)
        .map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - instant.getTime();
  };
  const guess = new Date(naive.getTime() - offsetAt(naive));
  return new Date(naive.getTime() - offsetAt(guess));
}

module.exports = { CITIES, localToUtc };
