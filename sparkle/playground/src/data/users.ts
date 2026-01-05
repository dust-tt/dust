import type { User } from "./types";

// Generate 80 diverse international users
// ~70% with avatars (56 users), ~30% without (24 users)
export const mockUsers: User[] = [
  // European names
  { id: "1", firstName: "Emma", lastName: "Andersson", fullName: "Emma Andersson", email: "emma.andersson@example.com", portrait: "https://i.pravatar.cc/150?u=emma1" },
  { id: "2", firstName: "Lucas", lastName: "Johansson", fullName: "Lucas Johansson", email: "lucas.johansson@example.com", portrait: "https://i.pravatar.cc/150?u=lucas2" },
  { id: "3", firstName: "Sophie", lastName: "Müller", fullName: "Sophie Müller", email: "sophie.muller@example.com", portrait: "https://i.pravatar.cc/150?u=sophie3" },
  { id: "4", firstName: "Thomas", lastName: "Schmidt", fullName: "Thomas Schmidt", email: "thomas.schmidt@example.com", portrait: "https://i.pravatar.cc/150?u=thomas4" },
  { id: "5", firstName: "Isabella", lastName: "Rossi", fullName: "Isabella Rossi", email: "isabella.rossi@example.com", portrait: "https://i.pravatar.cc/150?u=isabella5" },
  { id: "6", firstName: "Marco", lastName: "Ferrari", fullName: "Marco Ferrari", email: "marco.ferrari@example.com", portrait: "https://i.pravatar.cc/150?u=marco6" },
  { id: "7", firstName: "Amélie", lastName: "Dubois", fullName: "Amélie Dubois", email: "amelie.dubois@example.com", portrait: "https://i.pravatar.cc/150?u=amelie7" },
  { id: "8", firstName: "Pierre", lastName: "Martin", fullName: "Pierre Martin", email: "pierre.martin@example.com", portrait: "https://i.pravatar.cc/150?u=pierre8" },
  { id: "9", firstName: "Elena", lastName: "García", fullName: "Elena García", email: "elena.garcia@example.com", portrait: "https://i.pravatar.cc/150?u=elena9" },
  { id: "10", firstName: "Carlos", lastName: "Rodríguez", fullName: "Carlos Rodríguez", email: "carlos.rodriguez@example.com", portrait: "https://i.pravatar.cc/150?u=carlos10" },
  { id: "11", firstName: "Anna", lastName: "Kowalski", fullName: "Anna Kowalski", email: "anna.kowalski@example.com", portrait: "https://i.pravatar.cc/150?u=anna11" },
  { id: "12", firstName: "Jakub", lastName: "Nowak", fullName: "Jakub Nowak", email: "jakub.nowak@example.com", portrait: "https://i.pravatar.cc/150?u=jakub12" },
  { id: "13", firstName: "Olga", lastName: "Ivanova", fullName: "Olga Ivanova", email: "olga.ivanova@example.com", portrait: "https://i.pravatar.cc/150?u=olga13" },
  { id: "14", firstName: "Dmitri", lastName: "Petrov", fullName: "Dmitri Petrov", email: "dmitri.petrov@example.com", portrait: "https://i.pravatar.cc/150?u=dmitri14" },
  { id: "15", firstName: "Freya", lastName: "Hansen", fullName: "Freya Hansen", email: "freya.hansen@example.com", portrait: "https://i.pravatar.cc/150?u=freya15" },
  { id: "16", firstName: "Magnus", lastName: "Olsen", fullName: "Magnus Olsen", email: "magnus.olsen@example.com", portrait: "https://i.pravatar.cc/150?u=magnus16" },
  { id: "17", firstName: "Sofia", lastName: "Papadopoulos", fullName: "Sofia Papadopoulos", email: "sofia.papadopoulos@example.com", portrait: "https://i.pravatar.cc/150?u=sofia17" },
  { id: "18", firstName: "Nikolaos", lastName: "Georgiou", fullName: "Nikolaos Georgiou", email: "nikolaos.georgiou@example.com", portrait: "https://i.pravatar.cc/150?u=nikolaos18" },
  { id: "19", firstName: "Mia", lastName: "Jensen", fullName: "Mia Jensen", email: "mia.jensen@example.com", portrait: "https://i.pravatar.cc/150?u=mia19" },
  { id: "20", firstName: "Liam", lastName: "O'Connor", fullName: "Liam O'Connor", email: "liam.oconnor@example.com", portrait: "https://i.pravatar.cc/150?u=liam20" },

  // Asian names
  { id: "21", firstName: "Wei", lastName: "Zhang", fullName: "Wei Zhang", email: "wei.zhang@example.com", portrait: "https://i.pravatar.cc/150?u=wei21" },
  { id: "22", firstName: "Li", lastName: "Wang", fullName: "Li Wang", email: "li.wang@example.com", portrait: "https://i.pravatar.cc/150?u=li22" },
  { id: "23", firstName: "Yuki", lastName: "Tanaka", fullName: "Yuki Tanaka", email: "yuki.tanaka@example.com", portrait: "https://i.pravatar.cc/150?u=yuki23" },
  { id: "24", firstName: "Hiroshi", lastName: "Suzuki", fullName: "Hiroshi Suzuki", email: "hiroshi.suzuki@example.com", portrait: "https://i.pravatar.cc/150?u=hiroshi24" },
  { id: "25", firstName: "Min-jun", lastName: "Kim", fullName: "Min-jun Kim", email: "minjun.kim@example.com", portrait: "https://i.pravatar.cc/150?u=minjun25" },
  { id: "26", firstName: "Soo-jin", lastName: "Park", fullName: "Soo-jin Park", email: "soojin.park@example.com", portrait: "https://i.pravatar.cc/150?u=soojin26" },
  { id: "27", firstName: "Priya", lastName: "Patel", fullName: "Priya Patel", email: "priya.patel@example.com", portrait: "https://i.pravatar.cc/150?u=priya27" },
  { id: "28", firstName: "Arjun", lastName: "Sharma", fullName: "Arjun Sharma", email: "arjun.sharma@example.com", portrait: "https://i.pravatar.cc/150?u=arjun28" },
  { id: "29", firstName: "Maya", lastName: "Kumar", fullName: "Maya Kumar", email: "maya.kumar@example.com", portrait: "https://i.pravatar.cc/150?u=maya29" },
  { id: "30", firstName: "Ravi", lastName: "Singh", fullName: "Ravi Singh", email: "ravi.singh@example.com", portrait: "https://i.pravatar.cc/150?u=ravi30" },
  { id: "31", firstName: "Anh", lastName: "Nguyen", fullName: "Anh Nguyen", email: "anh.nguyen@example.com", portrait: "https://i.pravatar.cc/150?u=anh31" },
  { id: "32", firstName: "Thi", lastName: "Tran", fullName: "Thi Tran", email: "thi.tran@example.com", portrait: "https://i.pravatar.cc/150?u=thi32" },
  { id: "33", firstName: "Siti", lastName: "Rahayu", fullName: "Siti Rahayu", email: "siti.rahayu@example.com", portrait: "https://i.pravatar.cc/150?u=siti33" },
  { id: "34", firstName: "Budi", lastName: "Santoso", fullName: "Budi Santoso", email: "budi.santoso@example.com", portrait: "https://i.pravatar.cc/150?u=budi34" },
  { id: "35", firstName: "Fatima", lastName: "Ali", fullName: "Fatima Ali", email: "fatima.ali@example.com", portrait: "https://i.pravatar.cc/150?u=fatima35" },
  { id: "36", firstName: "Muhammad", lastName: "Hassan", fullName: "Muhammad Hassan", email: "muhammad.hassan@example.com", portrait: "https://i.pravatar.cc/150?u=muhammad36" },
  { id: "37", firstName: "Aisha", lastName: "Khan", fullName: "Aisha Khan", email: "aisha.khan@example.com", portrait: "https://i.pravatar.cc/150?u=aisha37" },
  { id: "38", firstName: "Omar", lastName: "Ahmed", fullName: "Omar Ahmed", email: "omar.ahmed@example.com", portrait: "https://i.pravatar.cc/150?u=omar38" },
  { id: "39", firstName: "Layla", lastName: "Ibrahim", fullName: "Layla Ibrahim", email: "layla.ibrahim@example.com", portrait: "https://i.pravatar.cc/150?u=layla39" },
  { id: "40", firstName: "Zain", lastName: "Malik", fullName: "Zain Malik", email: "zain.malik@example.com", portrait: "https://i.pravatar.cc/150?u=zain40" },

  // Latin American names
  { id: "41", firstName: "María", lastName: "González", fullName: "María González", email: "maria.gonzalez@example.com", portrait: "https://i.pravatar.cc/150?u=maria41" },
  { id: "42", firstName: "Diego", lastName: "López", fullName: "Diego López", email: "diego.lopez@example.com", portrait: "https://i.pravatar.cc/150?u=diego42" },
  { id: "43", firstName: "Camila", lastName: "Silva", fullName: "Camila Silva", email: "camila.silva@example.com", portrait: "https://i.pravatar.cc/150?u=camila43" },
  { id: "44", firstName: "Gabriel", lastName: "Santos", fullName: "Gabriel Santos", email: "gabriel.santos@example.com", portrait: "https://i.pravatar.cc/150?u=gabriel44" },
  { id: "45", firstName: "Valentina", lastName: "Fernández", fullName: "Valentina Fernández", email: "valentina.fernandez@example.com", portrait: "https://i.pravatar.cc/150?u=valentina45" },
  { id: "46", firstName: "Santiago", lastName: "Martínez", fullName: "Santiago Martínez", email: "santiago.martinez@example.com", portrait: "https://i.pravatar.cc/150?u=santiago46" },
  { id: "47", firstName: "Isabella", lastName: "Costa", fullName: "Isabella Costa", email: "isabella.costa@example.com", portrait: "https://i.pravatar.cc/150?u=isabella47" },
  { id: "48", firstName: "Mateo", lastName: "Pereira", fullName: "Mateo Pereira", email: "mateo.pereira@example.com", portrait: "https://i.pravatar.cc/150?u=mateo48" },
  { id: "49", firstName: "Lucía", lastName: "Ramírez", fullName: "Lucía Ramírez", email: "lucia.ramirez@example.com", portrait: "https://i.pravatar.cc/150?u=lucia49" },
  { id: "50", firstName: "Sebastián", lastName: "Torres", fullName: "Sebastián Torres", email: "sebastian.torres@example.com", portrait: "https://i.pravatar.cc/150?u=sebastian50" },

  // African names
  { id: "51", firstName: "Amina", lastName: "Diallo", fullName: "Amina Diallo", email: "amina.diallo@example.com", portrait: "https://i.pravatar.cc/150?u=amina51" },
  { id: "52", firstName: "Kwame", lastName: "Asante", fullName: "Kwame Asante", email: "kwame.asante@example.com", portrait: "https://i.pravatar.cc/150?u=kwame52" },
  { id: "53", firstName: "Zara", lastName: "Okafor", fullName: "Zara Okafor", email: "zara.okafor@example.com", portrait: "https://i.pravatar.cc/150?u=zara53" },
  { id: "54", firstName: "Kofi", lastName: "Mensah", fullName: "Kofi Mensah", email: "kofi.mensah@example.com", portrait: "https://i.pravatar.cc/150?u=kofi54" },
  { id: "55", firstName: "Nia", lastName: "Kamau", fullName: "Nia Kamau", email: "nia.kamau@example.com", portrait: "https://i.pravatar.cc/150?u=nia55" },
  { id: "56", firstName: "Jabari", lastName: "Ndlovu", fullName: "Jabari Ndlovu", email: "jabari.ndlovu@example.com", portrait: "https://i.pravatar.cc/150?u=jabari56" },

  // Users without portraits (30% - 24 users)
  { id: "57", firstName: "Erik", lastName: "Berg", fullName: "Erik Berg", email: "erik.berg@example.com" },
  { id: "58", firstName: "Nina", lastName: "Vik", fullName: "Nina Vik", email: "nina.vik@example.com" },
  { id: "59", firstName: "Klaus", lastName: "Weber", fullName: "Klaus Weber", email: "klaus.weber@example.com" },
  { id: "60", firstName: "Greta", lastName: "Fischer", fullName: "Greta Fischer", email: "greta.fischer@example.com" },
  { id: "61", firstName: "Alessandro", lastName: "Conti", fullName: "Alessandro Conti", email: "alessandro.conti@example.com" },
  { id: "62", firstName: "Giulia", lastName: "Romano", fullName: "Giulia Romano", email: "giulia.romano@example.com" },
  { id: "63", firstName: "Léa", lastName: "Bernard", fullName: "Léa Bernard", email: "lea.bernard@example.com" },
  { id: "64", firstName: "Antoine", lastName: "Lefebvre", fullName: "Antoine Lefebvre", email: "antoine.lefebvre@example.com" },
  { id: "65", firstName: "Xiao", lastName: "Chen", fullName: "Xiao Chen", email: "xiao.chen@example.com" },
  { id: "66", firstName: "Mei", lastName: "Liu", fullName: "Mei Liu", email: "mei.liu@example.com" },
  { id: "67", firstName: "Sakura", lastName: "Yamamoto", fullName: "Sakura Yamamoto", email: "sakura.yamamoto@example.com" },
  { id: "68", firstName: "Kenji", lastName: "Watanabe", fullName: "Kenji Watanabe", email: "kenji.watanabe@example.com" },
  { id: "69", firstName: "Ji-woo", lastName: "Lee", fullName: "Ji-woo Lee", email: "jiwoo.lee@example.com" },
  { id: "70", firstName: "Hae-won", lastName: "Choi", fullName: "Hae-won Choi", email: "haewon.choi@example.com" },
  { id: "71", firstName: "Rohan", lastName: "Mehta", fullName: "Rohan Mehta", email: "rohan.mehta@example.com" },
  { id: "72", firstName: "Kavya", lastName: "Nair", fullName: "Kavya Nair", email: "kavya.nair@example.com" },
  { id: "73", firstName: "Linh", lastName: "Pham", fullName: "Linh Pham", email: "linh.pham@example.com" },
  { id: "74", firstName: "Duc", lastName: "Le", fullName: "Duc Le", email: "duc.le@example.com" },
  { id: "75", firstName: "Rizki", lastName: "Wijaya", fullName: "Rizki Wijaya", email: "rizki.wijaya@example.com" },
  { id: "76", firstName: "Sari", lastName: "Sari", fullName: "Sari Sari", email: "sari.sari@example.com" },
  { id: "77", firstName: "Yusuf", lastName: "Özdemir", fullName: "Yusuf Özdemir", email: "yusuf.ozdemir@example.com" },
  { id: "78", firstName: "Elif", lastName: "Yılmaz", fullName: "Elif Yılmaz", email: "elif.yilmaz@example.com" },
  { id: "79", firstName: "Andrés", lastName: "Vargas", fullName: "Andrés Vargas", email: "andres.vargas@example.com" },
  { id: "80", firstName: "Fernanda", lastName: "Morales", fullName: "Fernanda Morales", email: "fernanda.morales@example.com" },
];

/**
 * Get a random selection of users
 * @param count - Number of users to return
 * @returns Array of randomly selected users
 */
export function getRandomUsers(count: number): User[] {
  const shuffled = [...mockUsers].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, mockUsers.length));
}

/**
 * Get users by ID
 * @param ids - Array of user IDs
 * @returns Array of users matching the provided IDs
 */
export function getUsersByIds(ids: string[]): User[] {
  return mockUsers.filter((user) => ids.includes(user.id));
}

/**
 * Get a single user by ID
 * @param id - User ID
 * @returns User or undefined if not found
 */
export function getUserById(id: string): User | undefined {
  return mockUsers.find((user) => user.id === id);
}

