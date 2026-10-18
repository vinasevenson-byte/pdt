import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';

export interface BorderoProdutorProps {
  dados: EstadoProdutorRTDB;
}

export function BorderoProdutorModule({ dados }: BorderoProdutorProps) {
  return (
    <section className="card">
      <h2 className="h2">Borderô do Evento · {dados.produtoraNome}</h2>
      <p className="sub">Leitura exclusiva da projeção limpa gerada pelo servidor em <code>/borderos_produtor/{dados.produtoraId}</code>.</p>
      {dados.eventos.map(ev => (
        <div key={ev.id} className="row">
          <span>{ev.nome} ({ev.data})</span>
          <span className="num">Borderô: {formatBRL(ev.borderoEvento)} · Liberável: {formatBRL(ev.liberavel)}</span>
        </div>
      ))}
    </section>
  );
}
