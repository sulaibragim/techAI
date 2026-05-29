import { Car, Home, Building2, Lock, Wrench } from 'lucide-react';

export const BRANDS = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Audi',
  'Schlage', 'Kwikset', 'Yale', 'Medeco', 'Von Duprin', 'Adams Rite',
  'Amsec', 'SentrySafe', 'Corbin Russwin', 'Baldwin', 'Master Lock'
];

export const LOCK_TYPES = [
  { id: 'Automotive', icon: Car, label: 'Auto' },
  { id: 'Residential', icon: Home, label: 'Home' },
  { id: 'Commercial', icon: Building2, label: 'Business' },
  { id: 'Secure / Safe', icon: Lock, label: 'Safe/Vault' },
  { id: 'Other', icon: Wrench, label: 'Other' }
];
