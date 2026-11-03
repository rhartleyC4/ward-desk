/** A calling offered as the user types a calling title. */
export interface CommonCalling {
  title: string
  /** The organization it belongs to, used to group the list. */
  group: string
}

const group = (name: string, titles: string[]): CommonCalling[] => titles.map((title) => ({ title, group: name }))

/**
 * Ward callings from the General Handbook's ward callings chart (30.8.1) and the organization
 * chapters, plus the everyday titles wards use for its "other callings". Grouped in the order the
 * picker shows them. Users can still type any title that isn't here.
 */
export const COMMON_CALLINGS: CommonCalling[] = [
  ...group('Bishopric', ['Bishop', 'Bishopric First Counselor', 'Bishopric Second Counselor', 'Ward Clerk', 'Assistant Ward Clerk', 'Ward Executive Secretary', 'Assistant Ward Executive Secretary']),
  ...group('Elders Quorum', [
    'Elders Quorum President',
    'Elders Quorum First Counselor',
    'Elders Quorum Second Counselor',
    'Elders Quorum Secretary',
    'Elders Quorum Teacher',
    'Elders Quorum Activity Coordinator',
    'Ministering Brother',
  ]),
  ...group('Relief Society', [
    'Relief Society President',
    'Relief Society First Counselor',
    'Relief Society Second Counselor',
    'Relief Society Secretary',
    'Relief Society Teacher',
    'Relief Society Activity Coordinator',
    'Compassionate Service Coordinator',
    'Ministering Sister',
  ]),
  ...group('Aaronic Priesthood', [
    'Priests Quorum First Assistant',
    'Priests Quorum Second Assistant',
    'Teachers Quorum President',
    'Teachers Quorum First Counselor',
    'Teachers Quorum Second Counselor',
    'Teachers Quorum Secretary',
    'Deacons Quorum President',
    'Deacons Quorum First Counselor',
    'Deacons Quorum Second Counselor',
    'Deacons Quorum Secretary',
    'Aaronic Priesthood Quorum Adviser',
    'Aaronic Priesthood Quorum Specialist',
  ]),
  ...group('Young Women', [
    'Young Women President',
    'Young Women First Counselor',
    'Young Women Second Counselor',
    'Young Women Secretary',
    'Young Women Class Adviser',
    'Young Women Specialist',
    'Young Women Class President',
    'Young Women Class First Counselor',
    'Young Women Class Second Counselor',
    'Young Women Class Secretary',
  ]),
  ...group('Primary', [
    'Primary President',
    'Primary First Counselor',
    'Primary Second Counselor',
    'Primary Secretary',
    'Primary Teacher',
    'Primary Music Leader',
    'Primary Pianist',
    'Nursery Leader',
    'Primary Activity Leader',
  ]),
  ...group('Sunday School', [
    'Sunday School President',
    'Sunday School First Counselor',
    'Sunday School Second Counselor',
    'Sunday School Secretary',
    'Gospel Doctrine Teacher',
    'Youth Sunday School Teacher',
    'Ward Resource Center Specialist',
    'Ward Librarian',
  ]),
  ...group('Missionary', ['Ward Mission Leader', 'Ward Missionary']),
  ...group('Temple and Family History', ['Ward Temple and Family History Leader', 'Temple and Family History Consultant']),
  ...group('Music', ['Ward Music Coordinator', 'Ward Organist', 'Ward Chorister', 'Ward Choir Director', 'Ward Choir Accompanist']),
  ...group('Other', [
    'Ward Welfare and Self-Reliance Specialist',
    'Ward Activities Coordinator',
    'Ward Activities Committee Member',
    'Building Representative',
    'Emergency Preparedness Coordinator',
    'Ward Communication Specialist',
    'Ward Newsletter Editor',
    'Ward Bulletin Coordinator',
    'Interpreter',
  ]),
]
