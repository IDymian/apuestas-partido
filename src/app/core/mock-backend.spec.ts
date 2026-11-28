import { TestBed } from '@angular/core/testing';
import { league } from '../domain/league';
import { MockAdminApi, MockStore, TEST_CODE } from './mock-backend';

describe('MockAdminApi: partidos y equipos', () => {
  let api: MockAdminApi;
  let store: MockStore;
  const match = () => store.matches.find((m) => m.access_code === TEST_CODE)!;
  const teamIds = () => store.teams.filter((t) => t.match_id === match().id).sort((a, b) => a.sort_order - b.sort_order).map((t) => t.id);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MockAdminApi] });
    api = TestBed.inject(MockAdminApi);
    store = TestBed.inject(MockStore);
  });

  it('crear un partido de Modo 2 sin arrancarlo no marca jugados los pendientes del Modo 1', async () => {
    const m = match();
    m.status = 'open';
    m.current_game = 1;
    m.game_live = false;
    const [e1, e2] = teamIds();
    const n = await api.addGame(m.id, e2, e1, false, 2);
    expect(m.current_game).toBe(1);
    expect(m.game_live).toBe(false);
    expect(m.games!.at(-1)).toEqual({ number: n, home: e2, away: e1, mode: 2 });
    expect(store.markets.filter((k) => k.match_id === m.id && k.param === n).length).toBe(19);
    const l = league([], teamIds(), m.current_game, false, m.game_live, m.games);
    expect(l.games.filter((g) => (g.mode ?? 1) === 1).every((g) => g.status === 'pending')).toBe(true);
  });

  it('en vivo sí mueve el partido actual', async () => {
    const m = match();
    m.status = 'open';
    const [e1, , e3] = teamIds();
    const n = await api.addGame(m.id, e1, e3, true, 1);
    expect(m.current_game).toBe(n);
    expect(m.game_live).toBe(true);
  });

  it('valida equipos y jornada', async () => {
    const m = match();
    const [e1, e2] = teamIds();
    await expect(api.addGame(m.id, e1, e1)).rejects.toThrow(/distintos/);
    await expect(api.addGame(m.id, e1, 'otro')).rejects.toThrow(/del partido/);
    m.status = 'finished';
    await expect(api.addGame(m.id, e1, e2)).rejects.toThrow(/terminó/);
  });

  it('crea un equipo al final y se le puede asignar un jugador', async () => {
    const m = match();
    m.status = 'open';
    const id = await api.addTeam(m.id, '  Equipo 4 ', '#ff00ff');
    const t = store.teams.find((x) => x.id === id)!;
    expect(t).toEqual(expect.objectContaining({ name: 'Equipo 4', sort_order: 4, color: '#ff00ff', match_id: m.id }));
    const p = store.players.find((x) => x.match_id === m.id && !x.is_own_goal)!;
    await api.updatePlayer(p.id, { team_id: id });
    expect(p.team_id).toBe(id);
    await api.addGame(m.id, teamIds()[0], id);
    await expect(api.addTeam(m.id, '   ')).rejects.toThrow(/nombre/);
  });
});
