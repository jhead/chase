export type RadarSite = {
  id: string;
  name: string;
  coordinate: { lat: number; lng: number };
};

export const RADAR_SITES: RadarSite[] = [
  // Alaska
  {
    id: "PACG",
    name: "Anchorage",
    coordinate: { lat: 61.1747, lng: -149.9968 },
  },
  {
    id: "PAHG",
    name: "Anchorage Hills",
    coordinate: { lat: 60.7249, lng: -151.3505 },
  },
  {
    id: "PAKC",
    name: "King Salmon",
    coordinate: { lat: 58.6794, lng: -156.6294 },
  },
  {
    id: "PAIH",
    name: "Middleton Island",
    coordinate: { lat: 59.4617, lng: -146.3011 },
  },
  {
    id: "PAPD",
    name: "Fairbanks",
    coordinate: { lat: 65.0351, lng: -147.5018 },
  },
  {
    id: "PGUA",
    name: "Andersen AFB",
    coordinate: { lat: 13.454, lng: 144.811 },
  },

  // Hawaii
  {
    id: "PHKI",
    name: "South Kauai",
    coordinate: { lat: 21.8939, lng: -159.5525 },
  },
  { id: "PHKM", name: "Kohala", coordinate: { lat: 20.1252, lng: -155.7777 } },
  { id: "PHMO", name: "Molokai", coordinate: { lat: 21.1328, lng: -157.1803 } },
  {
    id: "PHWA",
    name: "South Shore",
    coordinate: { lat: 19.095, lng: -155.5689 },
  },

  // Pacific Northwest
  {
    id: "KATX",
    name: "Seattle/Tacoma",
    coordinate: { lat: 48.1945, lng: -122.4949 },
  },
  { id: "KMAX", name: "Medford", coordinate: { lat: 42.0811, lng: -122.7172 } },
  {
    id: "KPDT",
    name: "Pendleton",
    coordinate: { lat: 45.6906, lng: -118.8528 },
  },
  {
    id: "KRTX",
    name: "Portland",
    coordinate: { lat: 45.7147, lng: -122.9649 },
  },
  { id: "KOTX", name: "Spokane", coordinate: { lat: 47.7064, lng: -117.6258 } },

  // California
  {
    id: "KBBX",
    name: "Beale AFB",
    coordinate: { lat: 39.4963, lng: -121.6316 },
  },
  { id: "KBHX", name: "Eureka", coordinate: { lat: 40.4983, lng: -124.2918 } },
  {
    id: "KDAX",
    name: "Sacramento",
    coordinate: { lat: 38.5011, lng: -121.6778 },
  },
  {
    id: "KESX",
    name: "Las Vegas",
    coordinate: { lat: 35.7013, lng: -114.8919 },
  },
  {
    id: "KEYX",
    name: "Edwards AFB",
    coordinate: { lat: 35.0978, lng: -117.5608 },
  },
  {
    id: "KICX",
    name: "Cedar City",
    coordinate: { lat: 37.5908, lng: -112.8622 },
  },
  {
    id: "KVBX",
    name: "Vandenberg AFB",
    coordinate: { lat: 34.8383, lng: -120.3979 },
  },
  {
    id: "KMUX",
    name: "San Francisco",
    coordinate: { lat: 37.1552, lng: -121.8984 },
  },
  {
    id: "KNKX",
    name: "San Diego",
    coordinate: { lat: 32.9192, lng: -117.0419 },
  },
  {
    id: "KSOX",
    name: "Santa Ana Mountains",
    coordinate: { lat: 33.8177, lng: -117.635 },
  },

  // Southwest
  { id: "KABR", name: "Aberdeen", coordinate: { lat: 45.4558, lng: -98.4132 } },
  {
    id: "KABX",
    name: "Albuquerque",
    coordinate: { lat: 35.1497, lng: -106.8239 },
  },
  {
    id: "KAMA",
    name: "Amarillo",
    coordinate: { lat: 35.2333, lng: -101.7093 },
  },
  {
    id: "KBRO",
    name: "Brownsville",
    coordinate: { lat: 25.9161, lng: -97.4189 },
  },
  {
    id: "KDFX",
    name: "Laughlin AFB",
    coordinate: { lat: 29.2731, lng: -100.2803 },
  },
  { id: "KEPZ", name: "El Paso", coordinate: { lat: 31.8731, lng: -106.6975 } },
  {
    id: "KEWX",
    name: "San Antonio",
    coordinate: { lat: 29.7039, lng: -98.0283 },
  },
  {
    id: "KFWS",
    name: "Dallas/Fort Worth",
    coordinate: { lat: 32.5731, lng: -97.3031 },
  },
  {
    id: "KGRK",
    name: "Fort Hood",
    coordinate: { lat: 30.7219, lng: -97.3829 },
  },
  {
    id: "KHDX",
    name: "Holloman AFB",
    coordinate: { lat: 33.0769, lng: -106.1201 },
  },
  { id: "KINX", name: "Tulsa", coordinate: { lat: 36.1751, lng: -95.5642 } },
  {
    id: "KLCH",
    name: "Lake Charles",
    coordinate: { lat: 30.1253, lng: -93.216 },
  },
  {
    id: "KLIX",
    name: "New Orleans",
    coordinate: { lat: 30.3375, lng: -89.8255 },
  },
  { id: "KMAF", name: "Midland", coordinate: { lat: 31.9425, lng: -102.1894 } },
  {
    id: "KMLB",
    name: "Melbourne",
    coordinate: { lat: 28.1132, lng: -80.6541 },
  },
  { id: "KMOB", name: "Mobile", coordinate: { lat: 30.6794, lng: -88.2397 } },
  {
    id: "KPOE",
    name: "Fort Polk",
    coordinate: { lat: 31.1557, lng: -92.9759 },
  },
  { id: "KPUX", name: "Pueblo", coordinate: { lat: 38.4595, lng: -104.1813 } },
  {
    id: "KSJT",
    name: "San Angelo",
    coordinate: { lat: 31.3712, lng: -100.4922 },
  },
  {
    id: "KSRX",
    name: "Fort Smith",
    coordinate: { lat: 35.2904, lng: -94.3619 },
  },
  {
    id: "KTBW",
    name: "Tampa Bay",
    coordinate: { lat: 27.7054, lng: -82.4018 },
  },
  {
    id: "KTLH",
    name: "Tallahassee",
    coordinate: { lat: 30.3975, lng: -84.3289 },
  },
  { id: "KYUX", name: "Yuma", coordinate: { lat: 32.4953, lng: -114.6566 } },

  // Midwest
  { id: "KAPX", name: "Gaylord", coordinate: { lat: 44.9073, lng: -84.7198 } },
  {
    id: "KARX",
    name: "La Crosse",
    coordinate: { lat: 43.8228, lng: -91.1914 },
  },
  { id: "KCAE", name: "Columbia", coordinate: { lat: 33.9487, lng: -81.1184 } },
  { id: "KCBW", name: "Houlton", coordinate: { lat: 46.0392, lng: -67.8064 } },
  {
    id: "KCCX",
    name: "State College",
    coordinate: { lat: 40.9228, lng: -78.0039 },
  },
  {
    id: "KCLE",
    name: "Cleveland",
    coordinate: { lat: 41.4132, lng: -81.8597 },
  },
  {
    id: "KCLX",
    name: "Charleston",
    coordinate: { lat: 32.6554, lng: -81.0422 },
  },
  { id: "KCRI", name: "Norman", coordinate: { lat: 35.2383, lng: -97.4603 } },
  {
    id: "KCXX",
    name: "Burlington",
    coordinate: { lat: 44.5111, lng: -73.1664 },
  },
  {
    id: "KDDC",
    name: "Dodge City",
    coordinate: { lat: 37.7608, lng: -99.9688 },
  },
  { id: "KDLH", name: "Duluth", coordinate: { lat: 46.8369, lng: -92.2097 } },
  {
    id: "KDMX",
    name: "Des Moines",
    coordinate: { lat: 41.7312, lng: -93.7229 },
  },
  { id: "KDOX", name: "Dover AFB", coordinate: { lat: 38.8256, lng: -75.44 } },
  { id: "KDTX", name: "Detroit", coordinate: { lat: 42.6998, lng: -83.4717 } },
  {
    id: "KDVN",
    name: "Davenport",
    coordinate: { lat: 41.6116, lng: -90.5809 },
  },
  {
    id: "KEAX",
    name: "Kansas City",
    coordinate: { lat: 38.8103, lng: -94.2645 },
  },
  {
    id: "KEOX",
    name: "Fort Rucker",
    coordinate: { lat: 31.4602, lng: -85.4593 },
  },
  {
    id: "KEVX",
    name: "Eglin AFB",
    coordinate: { lat: 30.5652, lng: -85.9218 },
  },
  { id: "KFCX", name: "Roanoke", coordinate: { lat: 36.7777, lng: -80.274 } },
  {
    id: "KFDR",
    name: "Frederick",
    coordinate: { lat: 34.3622, lng: -98.9769 },
  },
  {
    id: "KFDX",
    name: "Cannon AFB",
    coordinate: { lat: 34.6352, lng: -103.6294 },
  },
  { id: "KFFC", name: "Atlanta", coordinate: { lat: 33.3635, lng: -84.5658 } },
  {
    id: "KFSD",
    name: "Sioux Falls",
    coordinate: { lat: 43.5878, lng: -96.7294 },
  },
  {
    id: "KFSX",
    name: "Flagstaff",
    coordinate: { lat: 34.5743, lng: -111.1983 },
  },
  { id: "KFTG", name: "Denver", coordinate: { lat: 39.7861, lng: -104.5458 } },
  {
    id: "KGLD",
    name: "Goodland",
    coordinate: { lat: 39.3669, lng: -101.7003 },
  },
  {
    id: "KGRB",
    name: "Green Bay",
    coordinate: { lat: 44.4983, lng: -88.1111 },
  },
  {
    id: "KGRR",
    name: "Grand Rapids",
    coordinate: { lat: 42.8939, lng: -85.5449 },
  },
  { id: "KGSP", name: "Greer", coordinate: { lat: 34.8833, lng: -82.22 } },
  {
    id: "KGWX",
    name: "Columbus AFB",
    coordinate: { lat: 33.8967, lng: -88.3292 },
  },
  { id: "KGYX", name: "Portland", coordinate: { lat: 43.8914, lng: -70.2569 } },
  {
    id: "KHGX",
    name: "Houston/Galveston",
    coordinate: { lat: 29.4719, lng: -95.0787 },
  },
  {
    id: "KHNX",
    name: "San Joaquin Valley",
    coordinate: { lat: 36.3142, lng: -119.632 },
  },
  {
    id: "KHPX",
    name: "Fort Campbell",
    coordinate: { lat: 36.7367, lng: -87.2853 },
  },
  {
    id: "KHTX",
    name: "Huntsville",
    coordinate: { lat: 34.9306, lng: -86.0836 },
  },
  { id: "KICT", name: "Wichita", coordinate: { lat: 37.6544, lng: -97.4428 } },
  {
    id: "KILN",
    name: "Cincinnati",
    coordinate: { lat: 39.4203, lng: -83.8217 },
  },
  { id: "KILX", name: "Lincoln", coordinate: { lat: 40.1506, lng: -89.3368 } },
  {
    id: "KIND",
    name: "Indianapolis",
    coordinate: { lat: 39.7075, lng: -86.2803 },
  },
  { id: "KIWA", name: "Phoenix", coordinate: { lat: 33.2891, lng: -111.6698 } },
  { id: "KIWX", name: "Fort Wayne", coordinate: { lat: 41.3586, lng: -85.7 } },
  {
    id: "KJAX",
    name: "Jacksonville",
    coordinate: { lat: 30.4847, lng: -81.7019 },
  },
  {
    id: "KJGX",
    name: "Robins AFB",
    coordinate: { lat: 32.6754, lng: -83.351 },
  },
  { id: "KJKL", name: "Jackson", coordinate: { lat: 37.5908, lng: -83.313 } },
  {
    id: "KLNX",
    name: "North Platte",
    coordinate: { lat: 41.9578, lng: -100.5758 },
  },
  { id: "KLOT", name: "Chicago", coordinate: { lat: 41.6044, lng: -88.0844 } },
  { id: "KLRX", name: "Elko", coordinate: { lat: 40.7397, lng: -116.8027 } },
  {
    id: "KLSX",
    name: "St. Louis",
    coordinate: { lat: 38.6989, lng: -90.6828 },
  },
  {
    id: "KLTX",
    name: "Wilmington",
    coordinate: { lat: 33.9891, lng: -78.4291 },
  },
  {
    id: "KLVX",
    name: "Fort Knox",
    coordinate: { lat: 37.9753, lng: -85.9439 },
  },
  {
    id: "KMBX",
    name: "Minot AFB",
    coordinate: { lat: 48.3933, lng: -100.8644 },
  },
  {
    id: "KMHX",
    name: "Morehead City",
    coordinate: { lat: 34.7759, lng: -76.8763 },
  },
  {
    id: "KMKX",
    name: "Milwaukee",
    coordinate: { lat: 42.9679, lng: -88.5506 },
  },
  {
    id: "KMPX",
    name: "Minneapolis",
    coordinate: { lat: 44.8489, lng: -93.5655 },
  },
  {
    id: "KMQT",
    name: "Marquette",
    coordinate: { lat: 46.5311, lng: -87.5483 },
  },
  {
    id: "KMRX",
    name: "Knoxville/Tri Cities",
    coordinate: { lat: 36.1686, lng: -83.4017 },
  },
  { id: "KMSX", name: "Missoula", coordinate: { lat: 47.0412, lng: -113.986 } },
  {
    id: "KMTX",
    name: "Salt Lake City",
    coordinate: { lat: 41.2628, lng: -112.4469 },
  },
  {
    id: "KMVX",
    name: "Grand Forks",
    coordinate: { lat: 47.528, lng: -97.3252 },
  },
  {
    id: "KMXX",
    name: "Maxwell AFB",
    coordinate: { lat: 32.5367, lng: -85.7898 },
  },
  { id: "KNQA", name: "Memphis", coordinate: { lat: 35.3447, lng: -89.8734 } },
  { id: "KOAX", name: "Omaha", coordinate: { lat: 41.3204, lng: -96.3668 } },
  {
    id: "KOHX",
    name: "Nashville",
    coordinate: { lat: 36.2472, lng: -86.5625 },
  },
  {
    id: "KOKX",
    name: "New York City",
    coordinate: { lat: 40.8656, lng: -72.8644 },
  },
  { id: "KPAH", name: "Paducah", coordinate: { lat: 37.0683, lng: -88.772 } },
  {
    id: "KPBZ",
    name: "Pittsburgh",
    coordinate: { lat: 40.5317, lng: -80.2178 },
  },
  { id: "KRAX", name: "Raleigh", coordinate: { lat: 35.6655, lng: -78.4898 } },
  { id: "KRGX", name: "Reno", coordinate: { lat: 39.7542, lng: -119.462 } },
  {
    id: "KRIW",
    name: "Riverton",
    coordinate: { lat: 43.0661, lng: -108.4767 },
  },
  {
    id: "KRLX",
    name: "Charleston",
    coordinate: { lat: 38.3111, lng: -81.7229 },
  },
  {
    id: "KRMX",
    name: "Griffiss AFB",
    coordinate: { lat: 42.5888, lng: -76.4791 },
  },
  {
    id: "KSFX",
    name: "Pocatello",
    coordinate: { lat: 43.1057, lng: -112.6861 },
  },
  {
    id: "KSGF",
    name: "Springfield",
    coordinate: { lat: 37.2352, lng: -93.4007 },
  },
  {
    id: "KSHV",
    name: "Shreveport",
    coordinate: { lat: 32.4508, lng: -93.8412 },
  },
  {
    id: "KTLX",
    name: "Oklahoma City",
    coordinate: { lat: 35.3337, lng: -97.2778 },
  },
  { id: "KTWX", name: "Topeka", coordinate: { lat: 38.9969, lng: -96.2325 } },
  { id: "KUEX", name: "Hastings", coordinate: { lat: 40.3209, lng: -98.4417 } },
  {
    id: "KVNX",
    name: "Vance AFB",
    coordinate: { lat: 36.7408, lng: -98.1275 },
  },
  {
    id: "KVWX",
    name: "Evansville",
    coordinate: { lat: 38.2603, lng: -87.7247 },
  },
];
