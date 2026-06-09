import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Job, JobStatus, MissedInteraction, Message, CallRecord, LineItem, Part, TabId } from './types';
import { calculateFinancialMetrics } from './financialUtils';
import { useSettingsStore } from './settingsStore';
import { useAuthStore } from './authStore';
import { API_BASE } from './backendUrl';

const getDynamicDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

const INITIAL_JOBS: Job[] = [];

const _DEMO_JOBS_REMOVED: Job[] = [
  {
    id: 'job-1',
    jobNumber: 'LK-8402',
    client: {
      id: 'c-1',
      firstName: 'Sarah',
      lastName: 'Jenkins',
      phone: '(555) 019-8234',
      email: 'sarah.j@example.com',
      address: '4421 Evergreen Terrace, Portland, OR',
    },
    lockDetails: { type: 'Automotive', brand: 'Toyota', modelOrYear: '2019 Camry' },
    complaint: 'Lost all keys at the shopping mall. Push-to-start vehicle.',
    diagnosisNotes: 'Generated new smart key and programmed via OBD-II port. Deleted old keys from system.',
    scheduledDate: getDynamicDate(-1), 
    scheduledTime: '09:00',
    durationMinutes: 90,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '1', type: 'service_call', description: 'Emergency Mobile Service Fee', unitPrice: 85, quantity: 1 },
      { id: '2', type: 'part', description: 'Toyota Smart Proximity Key (OEM)', unitPrice: 195, quantity: 1 },
      { id: '3', type: 'labor', description: 'EEPROM / OBD-II Programming', unitPrice: 120, quantity: 1 }
    ],
    totalAmount: 400
  },
  {
    id: 'job-2',
    jobNumber: 'LK-8411',
    client: {
      id: 'c-2',
      firstName: 'Marcus',
      lastName: 'Chen',
      phone: '(555) 832-1100',
      email: 'mchen@example.com',
      address: '8900 Westheimer Rd, Houston, TX',
    },
    lockDetails: { type: 'Commercial', brand: 'Von Duprin', modelOrYear: '99 Series Exit Device' },
    complaint: 'Panic bar sticking open. Door will not secure at night.',
    diagnosisNotes: 'Center case mechanism fractured. Installed new center case and adjusted dogging rod.',
    scheduledDate: getDynamicDate(0), 
    scheduledTime: '10:30',
    durationMinutes: 60,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '4', type: 'service_call', description: 'Commercial Service Call', unitPrice: 95, quantity: 1 },
      { id: '5', type: 'part', description: 'Center Case Replacement Part', unitPrice: 280, quantity: 1 },
      { id: '6', type: 'labor', description: 'Labor - Commercial Hardware', unitPrice: 115, quantity: 1 }
    ],
    totalAmount: 490
  },
  {
    id: 'job-3',
    jobNumber: 'LK-8422',
    client: {
      id: 'c-3',
      firstName: 'Julia',
      lastName: 'Robson',
      phone: '(555) 773-4021',
      email: 'julia.rob@example.com',
      address: '112 Oak Tree Ln, Austin, TX',
    },
    lockDetails: { type: 'Residential', brand: 'Schlage', modelOrYear: 'Encode Smart WiFi' },
    complaint: 'Smart lock keypad unresponsive. Locked out of the house.',
    diagnosisNotes: 'Bypassed lock via bottom cylinder. Keypad board fried due to moisture. Replaced entire exterior trim.',
    scheduledDate: getDynamicDate(0), 
    scheduledTime: '13:00',
    durationMinutes: 120,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '7', type: 'service_call', description: 'Emergency House Lockout', unitPrice: 120, quantity: 1 },
      { id: '8', type: 'part', description: 'Schlage Encode Exterior Trim', unitPrice: 185, quantity: 1 },
      { id: '9', type: 'labor', description: 'Standard Labor', unitPrice: 85, quantity: 1 }
    ],
    totalAmount: 390
  },
  {
    id: 'job-4',
    jobNumber: 'LK-8433',
    client: {
      id: 'c-4',
      firstName: 'David',
      lastName: 'Kim',
      phone: '(555) 443-8199',
      email: 'dkim@example.com',
      address: '2244 River Walk, Chicago, IL',
    },
    lockDetails: { type: 'Secure / Safe', brand: 'Amsec', modelOrYear: 'BF6030' },
    complaint: 'Lost combination to the gun safe. Needs to be opened.',
    diagnosisNotes: 'Dial manipulation unsuccessful. Precision drilled and scoped the lock. Replaced with LaGard electronic keypad.',
    scheduledDate: getDynamicDate(1), 
    scheduledTime: '15:00',
    durationMinutes: 180,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '10', type: 'labor', description: 'Safe Drilling & Defeat', unitPrice: 350, quantity: 1 },
      { id: '11', type: 'part', description: 'LaGard Basic Electronic Lock retrofit', unitPrice: 165, quantity: 1 }
    ],
    totalAmount: 515
  },
  {
    id: 'job-5',
    jobNumber: 'LK-8444',
    client: {
      id: 'c-5',
      firstName: 'Alina',
      lastName: 'Vance',
      phone: '(555) 554-1234',
      email: 'alina.v@example.com',
      address: '400 Pine St, Seattle, WA',
    },
    lockDetails: { type: 'Automotive', brand: 'Ford', modelOrYear: '2021 F-150' },
    complaint: 'Key broke off inside the ignition cylinder.',
    diagnosisNotes: 'Extracted broken blade. Ignition required rebuild. Cut and programmed 2 new transponder keys.',
    scheduledDate: getDynamicDate(2), 
    scheduledTime: '08:30',
    durationMinutes: 75,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '12', type: 'labor', description: 'Key Extraction', unitPrice: 85, quantity: 1 },
      { id: '13', type: 'part', description: 'Ignition Cylinder Rebuild Kit', unitPrice: 65, quantity: 1 },
      { id: '14', type: 'part', description: 'Ford H92 Transponder Key (x2)', unitPrice: 90, quantity: 2 },
      { id: '15', type: 'labor', description: 'Labor', unitPrice: 110, quantity: 1 }
    ],
    totalAmount: 440
  },
  {
    id: 'job-6',
    jobNumber: 'LK-8451',
    client: {
      id: 'c-6',
      firstName: 'Tom',
      lastName: 'Hanks',
      phone: '(555) 123-9999',
      email: 'thanks@example.com',
      address: '1001 Hollywood Blvd, LA, CA',
    },
    lockDetails: { type: 'Commercial', brand: 'Adams Rite', modelOrYear: 'Deadlatch 4510' },
    complaint: 'Front storefront door won\'t latch shut. Cylinder spins freely.',
    diagnosisNotes: 'Cam broken off the mortise cylinder. Set screw was loose. Replaced mortise cylinder and tightened down.',
    scheduledDate: getDynamicDate(2), 
    scheduledTime: '11:00',
    durationMinutes: 45,
    status: 'diagnosed',
    paymentStatus: 'unpaid',
    assignedTo: 'u-tech',
    photos: [],
    lineItems: [
      { id: '16', type: 'service_call', description: 'Commercial Service Call', unitPrice: 95, quantity: 1 },
      { id: '17', type: 'part', description: '1" Mortise Cylinder (SC1 Keyway)', unitPrice: 45, quantity: 1 }
    ],
    totalAmount: 140
  },
  {
    id: 'job-7',
    jobNumber: 'LK-8460',
    client: {
      id: 'c-7',
      firstName: 'Emma',
      lastName: 'Stone',
      phone: '(555) 234-5678',
      email: 'emma.s@example.com',
      address: '777 Sunset Strip, LA, CA',
    },
    lockDetails: { type: 'Residential', brand: 'Kwikset', modelOrYear: 'SmartKey Defiant' },
    complaint: 'Tried to rekey lock myself, now no keys work.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(3), 
    scheduledTime: '10:00',
    durationMinutes: 60,
    status: 'enRoute',
    paymentStatus: 'unpaid',
    assignedTo: 'u-tech',
    photos: [],
    lineItems: [],
    totalAmount: 0
  },
  {
    id: 'job-8',
    jobNumber: 'LK-8465',
    client: {
      id: 'c-8',
      firstName: 'Robert',
      lastName: 'Downey',
      phone: '(555) 888-2233',
      email: 'robert.d@example.com',
      address: '12 Malibu Point, Malibu, CA',
    },
    lockDetails: { type: 'Automotive', brand: 'Audi', modelOrYear: '2016 Q5' },
    complaint: 'Keys locked in the trunk. Need emergency access.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(3), 
    scheduledTime: '14:30',
    durationMinutes: 45,
    status: 'scheduled',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [],
    totalAmount: 0
  },
  {
    id: 'job-9',
    jobNumber: 'LK-8472',
    client: {
      id: 'c-9',
      firstName: 'Chris',
      lastName: 'Evans',
      phone: '(555) 999-1122',
      email: 'chris.e@example.com',
      address: '45 Brooklyn Ave, NY, NY',
    },
    lockDetails: { type: 'Commercial', brand: 'Simplex', modelOrYear: '1000 Series Pushbutton' },
    complaint: 'Mechanical keypad combination needs to be changed for new management.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(4), 
    scheduledTime: '16:00',
    durationMinutes: 90,
    status: 'scheduled',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [],
    totalAmount: 0
  },
  {
    id: 'job-10',
    jobNumber: 'LK-8480',
    client: {
      id: 'c-10',
      firstName: 'Scarlett',
      lastName: 'Johansson',
      phone: '(555) 333-4455',
      email: 'scarlett.j@example.com',
      address: '88 Broadway, NY, NY',
    },
    lockDetails: { type: 'Secure / Safe', brand: 'SentrySafe', modelOrYear: 'SFW123GDC' },
    complaint: 'Keypad is beeping and flashing but the handle won\'t turn. Changed batteries already.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(5),
    scheduledTime: '09:00',
    durationMinutes: 60,
    status: 'scheduled',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [],
    totalAmount: 0
  },
  // Historical completed jobs for realistic chart data
  { id: 'job-h1', jobNumber: 'LK-8391', client: { id: 'c-h1', firstName: 'Mike', lastName: 'Torres', phone: '(555) 111-2233', email: 'mt@example.com', address: '55 Elm St, Phoenix, AZ' }, lockDetails: { type: 'Residential', brand: 'Kwikset', modelOrYear: 'SmartKey 910' }, complaint: 'Rekeying service for new tenants.', diagnosisNotes: 'Rekeyed 3 locks to new key.', scheduledDate: getDynamicDate(-3), scheduledTime: '10:00', durationMinutes: 45, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h1-1', type: 'labor', description: 'Rekey 3 locks', unitPrice: 120, quantity: 1 }], totalAmount: 120 },
  { id: 'job-h2', jobNumber: 'LK-8392', client: { id: 'c-h2', firstName: 'Linda', lastName: 'Park', phone: '(555) 222-3344', email: 'lp@example.com', address: '90 Cedar Ave, Denver, CO' }, lockDetails: { type: 'Automotive', brand: 'Honda', modelOrYear: '2018 Accord' }, complaint: 'Key fob not working, need spare key programmed.', diagnosisNotes: 'Programmed 1 new transponder key.', scheduledDate: getDynamicDate(-3), scheduledTime: '14:00', durationMinutes: 60, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h2-1', type: 'part', description: 'Honda Transponder Key', unitPrice: 85, quantity: 1 }, { id: 'h2-2', type: 'labor', description: 'Programming', unitPrice: 95, quantity: 1 }], totalAmount: 180 },
  { id: 'job-h3', jobNumber: 'LK-8378', client: { id: 'c-h3', firstName: 'Gary', lastName: 'Webb', phone: '(555) 333-4455', email: 'gw@example.com', address: '22 Birch Rd, Tampa, FL' }, lockDetails: { type: 'Commercial', brand: 'Corbin Russwin', modelOrYear: 'ML20900' }, complaint: 'Master key system for office suite.', diagnosisNotes: 'Pinned 6-lock master key system.', scheduledDate: getDynamicDate(-5), scheduledTime: '08:00', durationMinutes: 180, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h3-1', type: 'labor', description: 'Master key system setup', unitPrice: 280, quantity: 1 }, { id: 'h3-2', type: 'part', description: 'Key cutting x8', unitPrice: 80, quantity: 1 }], totalAmount: 360 },
  { id: 'job-h4', jobNumber: 'LK-8365', client: { id: 'c-h4', firstName: 'Nina', lastName: 'Kozlov', phone: '(555) 444-5566', email: 'nk@example.com', address: '38 Walnut Ln, Nashville, TN' }, lockDetails: { type: 'Residential', brand: 'Medeco', modelOrYear: 'Maxum' }, complaint: 'Locked out, door left on latch.', diagnosisNotes: 'Non-destructive bypass. Picked open.', scheduledDate: getDynamicDate(-5), scheduledTime: '22:30', durationMinutes: 30, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h4-1', type: 'service_call', description: 'Emergency night lockout', unitPrice: 145, quantity: 1 }], totalAmount: 145 },
  { id: 'job-h5', jobNumber: 'LK-8354', client: { id: 'c-h5', firstName: 'Brandon', lastName: 'Scott', phone: '(555) 555-6677', email: 'bs@example.com', address: '77 Maple Dr, Minneapolis, MN' }, lockDetails: { type: 'Automotive', brand: 'BMW', modelOrYear: '2020 X3' }, complaint: 'Lost all keys. Need 2 new keys programmed.', diagnosisNotes: 'Programmed 2 blade + fob keys via dealer tool.', scheduledDate: getDynamicDate(-7), scheduledTime: '11:00', durationMinutes: 90, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h5-1', type: 'part', description: 'BMW Key Blade x2', unitPrice: 240, quantity: 1 }, { id: 'h5-2', type: 'labor', description: 'Programming & calibration', unitPrice: 180, quantity: 1 }], totalAmount: 420 },
  { id: 'job-h6', jobNumber: 'LK-8341', client: { id: 'c-h6', firstName: 'Priya', lastName: 'Nair', phone: '(555) 666-7788', email: 'pn@example.com', address: '45 Oak Street, Boston, MA' }, lockDetails: { type: 'Secure / Safe', brand: 'Liberty', modelOrYear: 'Colonial 23' }, complaint: 'Combination forgotten. Needs new lock.', diagnosisNotes: 'Drilled & replaced with SecuRam ProLogic.', scheduledDate: getDynamicDate(-8), scheduledTime: '09:30', durationMinutes: 120, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h6-1', type: 'labor', description: 'Safe drilling', unitPrice: 320, quantity: 1 }, { id: 'h6-2', type: 'part', description: 'SecuRam electronic lock', unitPrice: 210, quantity: 1 }], totalAmount: 530 },
  { id: 'job-h7', jobNumber: 'LK-8338', client: { id: 'c-h7', firstName: 'Carlos', lastName: 'Ruiz', phone: '(555) 777-8899', email: 'cr@example.com', address: '800 Palm Ave, Miami, FL' }, lockDetails: { type: 'Residential', brand: 'Schlage', modelOrYear: 'B60N' }, complaint: 'Deadbolt not retracting smoothly.', diagnosisNotes: 'Adjusted strike plate, lubricated bolt.', scheduledDate: getDynamicDate(-8), scheduledTime: '15:30', durationMinutes: 30, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h7-1', type: 'service_call', description: 'Service & adjustment', unitPrice: 85, quantity: 1 }], totalAmount: 85 },
  { id: 'job-h8', jobNumber: 'LK-8320', client: { id: 'c-h8', firstName: 'Angela', lastName: 'White', phone: '(555) 888-9900', email: 'aw@example.com', address: '14 Pine Circle, San Diego, CA' }, lockDetails: { type: 'Commercial', brand: 'ASSA Abloy', modelOrYear: 'HiSec 2000' }, complaint: 'Access control card reader offline after power outage.', diagnosisNotes: 'Reset controller board and reprogrammed access cards.', scheduledDate: getDynamicDate(-10), scheduledTime: '08:00', durationMinutes: 90, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h8-1', type: 'labor', description: 'Access control reconfiguration', unitPrice: 195, quantity: 1 }, { id: 'h8-2', type: 'service_call', description: 'Commercial service call', unitPrice: 95, quantity: 1 }], totalAmount: 290 },
  { id: 'job-h9', jobNumber: 'LK-8311', client: { id: 'c-h9', firstName: 'Felix', lastName: 'Meyer', phone: '(555) 100-2020', email: 'fm@example.com', address: '201 Rosewood Dr, Atlanta, GA' }, lockDetails: { type: 'Automotive', brand: 'Chevrolet', modelOrYear: '2017 Silverado' }, complaint: 'Broke key off in ignition.', diagnosisNotes: 'Extracted broken key. Cut and programmed new key.', scheduledDate: getDynamicDate(-11), scheduledTime: '12:00', durationMinutes: 60, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h9-1', type: 'labor', description: 'Key extraction', unitPrice: 80, quantity: 1 }, { id: 'h9-2', type: 'part', description: 'Transponder key', unitPrice: 65, quantity: 1 }, { id: 'h9-3', type: 'labor', description: 'Programming', unitPrice: 85, quantity: 1 }], totalAmount: 230 },
  { id: 'job-h10', jobNumber: 'LK-8298', client: { id: 'c-h10', firstName: 'Sophie', lastName: 'Laurent', phone: '(555) 200-3030', email: 'sl@example.com', address: '501 Lakeview Blvd, Portland, OR' }, lockDetails: { type: 'Residential', brand: 'Baldwin', modelOrYear: 'Prestige Series' }, complaint: 'New construction lock-up, need 4 deadbolts installed.', diagnosisNotes: 'Installed and keyed alike 4 x Schlage B60N.', scheduledDate: getDynamicDate(-13), scheduledTime: '09:00', durationMinutes: 150, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h10-1', type: 'part', description: 'Schlage B60N x4', unitPrice: 280, quantity: 1 }, { id: 'h10-2', type: 'labor', description: 'Install & key alike', unitPrice: 160, quantity: 1 }], totalAmount: 440 },
  { id: 'job-h11', jobNumber: 'LK-8291', client: { id: 'c-h11', firstName: 'James', lastName: 'Morgan', phone: '(555) 300-4040', email: 'jm@example.com', address: '33 Willow Way, Sacramento, CA' }, lockDetails: { type: 'Commercial', brand: 'Kaba', modelOrYear: 'Simplex 1021' }, complaint: 'Combination change for new security staff.', diagnosisNotes: 'Reset combination and tested 20 entries.', scheduledDate: getDynamicDate(-13), scheduledTime: '14:30', durationMinutes: 45, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h11-1', type: 'labor', description: 'Combination change + test', unitPrice: 120, quantity: 1 }], totalAmount: 120 },
  { id: 'job-h12', jobNumber: 'LK-8275', client: { id: 'c-h12', firstName: 'Rachel', lastName: 'Green', phone: '(555) 400-5050', email: 'rg@example.com', address: '90 Spruce Ct, Columbus, OH' }, lockDetails: { type: 'Residential', brand: 'Weiser', modelOrYear: 'SmartCode 10' }, complaint: 'Locked out at midnight.', diagnosisNotes: 'Picked cylinder. Recommended deadbolt upgrade.', scheduledDate: getDynamicDate(-14), scheduledTime: '23:00', durationMinutes: 25, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h12-1', type: 'service_call', description: 'Emergency night lockout', unitPrice: 155, quantity: 1 }], totalAmount: 155 },
  { id: 'job-h13', jobNumber: 'LK-8260', client: { id: 'c-h13', firstName: 'Dan', lastName: 'Harper', phone: '(555) 500-6060', email: 'dh@example.com', address: '12 Oakwood Dr, Dallas, TX' }, lockDetails: { type: 'Automotive', brand: 'Nissan', modelOrYear: '2019 Pathfinder' }, complaint: 'Locked keys in car, running engine.', diagnosisNotes: 'Long reach tool unlock.', scheduledDate: getDynamicDate(-16), scheduledTime: '10:15', durationMinutes: 20, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h13-1', type: 'service_call', description: 'Vehicle lockout', unitPrice: 85, quantity: 1 }], totalAmount: 85 },
  { id: 'job-h14', jobNumber: 'LK-8251', client: { id: 'c-h14', firstName: 'Maria', lastName: 'Santos', phone: '(555) 600-7070', email: 'ms@example.com', address: '600 Harbor Blvd, San Francisco, CA' }, lockDetails: { type: 'Commercial', brand: 'Sargent', modelOrYear: '8200 Series Mortise' }, complaint: 'Hotel corridor upgrade — rekey 12 guest rooms.', diagnosisNotes: 'Rekeyed 12 Sargent mortise cylinders to new master.', scheduledDate: getDynamicDate(-16), scheduledTime: '13:00', durationMinutes: 180, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h14-1', type: 'labor', description: 'Rekey 12 cylinders', unitPrice: 360, quantity: 1 }, { id: 'h14-2', type: 'part', description: 'Master key cuts x15', unitPrice: 90, quantity: 1 }], totalAmount: 450 },
  { id: 'job-h15', jobNumber: 'LK-8239', client: { id: 'c-h15', firstName: 'Eric', lastName: 'Walsh', phone: '(555) 700-8080', email: 'ew@example.com', address: '17 Maple Grove, Richmond, VA' }, lockDetails: { type: 'Secure / Safe', brand: 'Gardall', modelOrYear: 'MS911-G-C' }, complaint: 'Inherited safe, no combination.', diagnosisNotes: 'Manipulation — 45min. Opened without drilling.', scheduledDate: getDynamicDate(-18), scheduledTime: '11:00', durationMinutes: 90, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h15-1', type: 'labor', description: 'Safe manipulation', unitPrice: 385, quantity: 1 }], totalAmount: 385 },
  { id: 'job-h16', jobNumber: 'LK-8222', client: { id: 'c-h16', firstName: 'Tanya', lastName: 'Reeves', phone: '(555) 800-9090', email: 'tr@example.com', address: '300 Sunshine Blvd, Orlando, FL' }, lockDetails: { type: 'Residential', brand: 'Schlage', modelOrYear: 'FE595' }, complaint: 'Smart lock battery died, keypad unresponsive.', diagnosisNotes: 'Replaced batteries, reset codes, tested fully.', scheduledDate: getDynamicDate(-20), scheduledTime: '09:45', durationMinutes: 30, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h16-1', type: 'service_call', description: 'Smart lock service', unitPrice: 95, quantity: 1 }], totalAmount: 95 },
  { id: 'job-h17', jobNumber: 'LK-8210', client: { id: 'c-h17', firstName: 'Noah', lastName: 'Black', phone: '(555) 900-1010', email: 'nb@example.com', address: '55 Crescent Park, Seattle, WA' }, lockDetails: { type: 'Automotive', brand: 'Toyota', modelOrYear: '2022 Tacoma' }, complaint: 'Need a spare key made.', diagnosisNotes: 'Cut and programmed 1 smart key via OBD.', scheduledDate: getDynamicDate(-20), scheduledTime: '14:00', durationMinutes: 45, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h17-1', type: 'part', description: 'Toyota smart key OEM', unitPrice: 195, quantity: 1 }, { id: 'h17-2', type: 'labor', description: 'Cut & program', unitPrice: 110, quantity: 1 }], totalAmount: 305 },
  { id: 'job-h18', jobNumber: 'LK-8195', client: { id: 'c-h18', firstName: 'Isabelle', lastName: 'Fontaine', phone: '(555) 010-1120', email: 'if@example.com', address: '1200 Riverside Dr, Austin, TX' }, lockDetails: { type: 'Commercial', brand: 'Dormakaba', modelOrYear: 'Saflok MT' }, complaint: 'RFID card reader needs reprogramming after firmware update.', diagnosisNotes: 'Updated firmware, reprogrammed 30 cards.', scheduledDate: getDynamicDate(-22), scheduledTime: '08:30', durationMinutes: 120, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h18-1', type: 'labor', description: 'Firmware update & card reprogramming', unitPrice: 380, quantity: 1 }, { id: 'h18-2', type: 'service_call', description: 'Commercial call', unitPrice: 95, quantity: 1 }], totalAmount: 475 },
  { id: 'job-h19', jobNumber: 'LK-8180', client: { id: 'c-h19', firstName: 'Kevin', lastName: 'Fox', phone: '(555) 020-2230', email: 'kf@example.com', address: '42 Summit Rd, Salt Lake City, UT' }, lockDetails: { type: 'Residential', brand: 'Defiant', modelOrYear: 'Deadbolt' }, complaint: 'Door hardware replacement for rental unit.', diagnosisNotes: 'Replaced 2 deadbolts and 2 knobs, keyed alike.', scheduledDate: getDynamicDate(-25), scheduledTime: '11:00', durationMinutes: 90, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h19-1', type: 'part', description: 'Schlage B60N x2 + knob set x2', unitPrice: 210, quantity: 1 }, { id: 'h19-2', type: 'labor', description: 'Install & key alike', unitPrice: 140, quantity: 1 }], totalAmount: 350 },
  { id: 'job-h20', jobNumber: 'LK-8165', client: { id: 'c-h20', firstName: 'Diana', lastName: 'Reyes', phone: '(555) 030-3340', email: 'dr@example.com', address: '77 Highpoint Ave, Phoenix, AZ' }, lockDetails: { type: 'Automotive', brand: 'Mercedes', modelOrYear: '2019 GLC 300' }, complaint: 'Key battery dead, car locked.', diagnosisNotes: 'Emergency entry via mechanical key. New fob battery fitted.', scheduledDate: getDynamicDate(-27), scheduledTime: '18:45', durationMinutes: 20, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h20-1', type: 'service_call', description: 'Emergency lockout + battery', unitPrice: 95, quantity: 1 }], totalAmount: 95 },
  { id: 'job-h21', jobNumber: 'LK-8150', client: { id: 'c-h21', firstName: 'Oscar', lastName: 'Diaz', phone: '(555) 040-4450', email: 'od@example.com', address: '88 Harbor View, San Diego, CA' }, lockDetails: { type: 'Commercial', brand: 'Falcon', modelOrYear: 'D Series Mortise' }, complaint: 'Restaurant after-hours lockout, manager locked in office.', diagnosisNotes: 'Picked office lock. Recommended keypad upgrade.', scheduledDate: getDynamicDate(-27), scheduledTime: '21:00', durationMinutes: 35, status: 'completed', paymentStatus: 'paid', photos: [], lineItems: [{ id: 'h21-1', type: 'service_call', description: 'Emergency after-hours commercial', unitPrice: 175, quantity: 1 }], totalAmount: 175 }
];

const INITIAL_MISSED_INTERACTIONS: MissedInteraction[] = [];
const INITIAL_MESSAGES: Message[] = [];
const INITIAL_CALLS: CallRecord[] = [];

const INITIAL_INVENTORY: Part[] = [
  { id: '1', name: 'Schlage SC1 Key Blank', sku: 'KB-SC1-BR', category: 'Key Blanks', stock: 154, reorderPoint: 50, price: 1.5 },
  { id: '2', name: 'Kwikset KW1 Key Blank', sku: 'KB-KW1-BR', category: 'Key Blanks', stock: 212, reorderPoint: 50, price: 1.5 },
  { id: '3', name: 'Toyota Proximity Key (4 Button)', sku: 'RM-TOY-PROX4', category: 'Remotes', stock: 8, reorderPoint: 10, price: 85 },
  { id: '4', name: 'Ford H92 Transponder Key', sku: 'RM-FORD-H92', category: 'Remotes', stock: 12, reorderPoint: 10, price: 25 },
  { id: '5', name: 'Commercial Mortise Cylinder 1-1/8"', sku: 'CY-MORT-118-SC1', category: 'Cylinders', stock: 4, reorderPoint: 5, price: 32 },
  { id: '6', name: 'Schlage Encode Plymouth (Matte Black)', sku: 'HW-SCH-ENC-MB', category: 'Hardware', stock: 2, reorderPoint: 3, price: 245 },
  { id: '7', name: 'Lishi SC1 2-in-1 pick', sku: 'TL-LISHI-SC1', category: 'Tools', stock: 1, reorderPoint: 1, price: 65 },
];

function pushJobToServer(job: Job) {
  fetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  }).catch(() => {});
}

function updateJobOnServer(job: Job) {
  fetch(`${API_BASE}/api/jobs/${job.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  }).catch(() => {});
}

function deleteJobOnServer(id: string) {
  fetch(`${API_BASE}/api/jobs/${id}`, { method: 'DELETE' }).catch(() => {});
}

interface AppState {
  jobs: Job[];
  missedInteractions: MissedInteraction[];
  messages: Message[];
  calls: CallRecord[];
  inventory: Part[];
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  addJob: (job: Omit<Job, 'id' | 'createdAt'>) => void;
  updateJob: (job: Job) => void;
  removeJob: (id: string) => void;
  updateJobStatus: (id: string, status: JobStatus) => void;
  updateInventoryItem: (part: Part) => void;
  addInventoryItem: (part: Omit<Part, 'id'>) => void;
  removeInventoryItem: (id: string) => void;
  clearMissed: (id: string) => void;
  syncJobs: () => Promise<void>;
  getFinancialMetrics: () => { totalRevenue: number, targetRevenue: number, closeRate: number, paceIndicator: number };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  jobs: INITIAL_JOBS,
  missedInteractions: INITIAL_MISSED_INTERACTIONS,
  messages: INITIAL_MESSAGES,
  calls: INITIAL_CALLS,
  inventory: INITIAL_INVENTORY,
  activeTab: 'calendar',
  setActiveTab: (tab) => set({ activeTab: tab }),
  addJob: (jobData) => {
    const auth = useAuthStore.getState();
    const creator = auth.users.find(u => u.id === auth.currentUserId);
    const newJob: Job = { ...jobData, id: `job-${Date.now()}`, createdAt: new Date().toISOString(), createdBy: creator?.id } as Job;
    set((state) => ({ jobs: [...state.jobs, newJob] }));
    pushJobToServer(newJob);
  },
  updateJob: (updatedJob) => {
    set((state) => ({ jobs: state.jobs.map(j => j.id === updatedJob.id ? updatedJob : j) }));
    updateJobOnServer(updatedJob);
  },
  removeJob: (id) => {
    set((state) => ({ jobs: state.jobs.filter(j => j.id !== id) }));
    deleteJobOnServer(id);
  },
  updateJobStatus: (id, status) => {
    set((state) => ({ jobs: state.jobs.map(j => j.id === id ? { ...j, status } : j) }));
    const job = get().jobs.find(j => j.id === id);
    if (job) updateJobOnServer(job);
  },
  updateInventoryItem: (part) => set((state) => ({
    inventory: state.inventory.map(p => p.id === part.id ? part : p)
  })),
  addInventoryItem: (part) => set((state) => ({
    inventory: [...state.inventory, { ...part, id: `part-${Date.now()}` }]
  })),
  removeInventoryItem: (id) => set((state) => ({
    inventory: state.inventory.filter(p => p.id !== id)
  })),
  clearMissed: (id) => set((state) => ({
    missedInteractions: state.missedInteractions.filter(m => m.id !== id)
  })),
  syncJobs: async () => {
    try {
      const local = get().jobs;
      if (local.length > 0) {
        const res = await fetch(`${API_BASE}/api/jobs/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(local),
        });
        if (res.ok) {
          const merged: Job[] = await res.json();
          set({ jobs: merged });
          return;
        }
      }
      const res = await fetch(`${API_BASE}/api/jobs`);
      if (res.ok) {
        const serverJobs: Job[] = await res.json();
        if (serverJobs.length > 0) set({ jobs: serverJobs });
      }
    } catch {}
  },
  getFinancialMetrics: () => {
    const { monthlyRevenueTarget, monthlyTargets } = useSettingsStore.getState();
    const nowKey = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; })();
    const metrics = calculateFinancialMetrics(get().jobs, monthlyTargets?.[nowKey] ?? monthlyRevenueTarget);
    return {
      totalRevenue: metrics.totalRevenue,
      targetRevenue: metrics.monthlyTarget,
      closeRate: metrics.closeRate,
      paceIndicator: metrics.jobsSold || 0
    };
  }
    }),
    {
      name: 'techai-crm-store-v3',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        jobs: state.jobs,
        inventory: state.inventory,
        messages: state.messages,
        calls: state.calls,
        missedInteractions: state.missedInteractions,
      }),
    }
  )
);

// Jobs visible to the current user. Technicians only see jobs assigned to them;
// owner and manager see everything.
export const useVisibleJobs = (): Job[] => {
  const jobs = useAppStore(s => s.jobs);
  const currentUserId = useAuthStore(s => s.currentUserId);
  const users = useAuthStore(s => s.users);
  const user = users.find(u => u.id === currentUserId) ?? null;
  if (user?.role === 'technician') return jobs.filter(j => j.assignedTo === user.id);
  return jobs;
};

export const useAIActions = () => {
  const handleAction = async (action: string, data: any): Promise<{ status: string; [key: string]: any }> => {
    console.log("AI Action Triggered", action, data);
    try {
      if (action === 'navigate_to') {
        if (data?.tab) {
          useAppStore.getState().setActiveTab(data.tab as TabId);
          return { status: 'success', tab: data.tab };
        }
        return { status: 'error', message: 'Missing tab parameter' };
      }
      if (action === 'get_app_state') {
        const state = useAppStore.getState();
        return {
          status: 'success',
          data: {
            jobs: state.jobs.map(j => ({
              id: j.id,
              jobNumber: j.jobNumber,
              clientName: `${j.client.firstName} ${j.client.lastName}`,
              status: j.status,
              scheduledDate: j.scheduledDate,
              scheduledTime: j.scheduledTime,
              totalAmount: j.totalAmount
            })),
            activeTab: state.activeTab,
            totalJobs: state.jobs.length
          }
        };
      }
      if (action === 'create_job') {
        if (data && typeof data === 'object') {
          useAppStore.getState().addJob(data);
          return { status: 'success', message: 'Job created' };
        }
        return { status: 'error', message: 'Invalid job data' };
      }
      if (action === 'update_job') {
        if (data?.jobId) {
          const state = useAppStore.getState();
          const job = state.jobs.find(j => j.id === data.jobId);
          if (job) {
            const { jobId, ...updates } = data;
            state.updateJob({ ...job, ...updates });
            return { status: 'success', message: 'Job updated' };
          }
          return { status: 'error', message: 'Job not found' };
        }
        return { status: 'error', message: 'Missing jobId' };
      }
      return { status: 'pending', message: 'Action not implemented yet' };
    } catch (err: any) {
      return { status: 'error', message: err?.message || 'Unknown error' };
    }
  };
  return { handleAction };
};
