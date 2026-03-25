import { describe, it, expect } from 'vitest';
import {
  validateUsername,
  validateFullname,
  validatePassword
} from '@/dtos/user.js';

describe('validateUsername', () => {
  it('lanza error si está vacío', () => {
    expect(() => validateUsername()).toThrow();
  });

  it('lanza error si es muy corto', () => {
    expect(() => validateUsername('ab')).toThrow();
  });

  it('lanza error si tiene caracteres inválidos', () => {
    expect(() => validateUsername('user name')).toThrow();
  });

  it('no lanza error si es válido', () => {
    expect(() => validateUsername('douglas')).not.toThrow();
  });

  it('lanza error si es muy largo', () => {
    expect(() => validateUsername('a'.repeat(31))).toThrow();
  });
});

describe('validateFullname', () => {
  it('rechaza nombre vacío', () => {
    expect(() => validateFullname()).toThrow();
  });

  it('requiere nombre y apellido', () => {
    expect(() => validateFullname('Juan')).toThrow();
  });

  it('acepta nombre válido', () => {
    expect(() => validateFullname('Juan Perez')).not.toThrow();
  });

  it('rechaza caracteres inválidos', () => {
    expect(() => validateFullname('Juan123')).toThrow();
  });

  it('rechaza espacios dobles', () => {
    expect(() => validateFullname('Juan  Perez')).toThrow();
  });
});

describe('validatePassword', () => {
  it('rechaza password débil', () => {
    expect(() => validatePassword('123')).toThrow();
  });

  it('acepta password fuerte', () => {
    expect(() => validatePassword('Password1!')).not.toThrow();
  });

  it('rechaza password con espacios', () => {
    expect(() => validatePassword('Pass word1!')).toThrow();
  });

  it('rechaza password muy corta', () => {
    expect(() => validatePassword('P1!a')).toThrow();
  });
});
