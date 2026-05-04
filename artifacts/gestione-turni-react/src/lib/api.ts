export type Ruolo = 'OSS' | 'INFERMIERA' | 'AUSILIARIO' | 'DEV' | 'CAPOSALA';

export type Dipendente = {
  id: number;
  nome: string;
  ruolo: Ruolo;
  ore_totali: number;
  notti_fatte: number;
  ferie: number;
  malattia: number;
  is_admin: boolean;
  preferenze_turno: Array<'MATTINO' | 'POMERIGGIO' | 'NOTTE'>;
  password_changed: boolean;
  last_login: string;
  last_seen: string;
};

export type TipoTurno = 'MATTINO' | 'POMERIGGIO' | 'NOTTE' | 'FERIE' | 'MALATTIA' | 'RIPOSO';

export type Turno = {
  id: number;
  dipendente_id: number;
  nome: string;
  ruolo: string;
  data: string;
  tipo: TipoTurno;
  ore: number;
  note: string;
};

export type Assenza = {
  id: number;
  dipendente_id: number;
  nome_dipendente: string;
  tipo: 'MALATTIA' | 'FERIE';
  data_inizio: string;
  data_fine: string;
  note: string;
  creata_il: string;
};

export type StatoScambio = 'IN_ATTESA' | 'APPROVATA' | 'RIFIUTATA';

export type RichiestaScambio = {
  id: number;
  richiedente_id: number;
  richiedente_nome: string;
  richiedente_ruolo: string;
  destinatario_id: number;
  destinatario_nome: string;
  destinatario_ruolo: string;
  turno_richiedente: Turno | null;
  turno_destinatario: Turno | null;
  stato: StatoScambio;
  nota: string;
  nota_caposala: string;
  creata_il: string;
};

export type GeneraResponse = {
  success: boolean;
  generati: number;
  saltati: number;
  modalita: string;
  giorni: number;
};
