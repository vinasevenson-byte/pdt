package br.com.diskingressos.conciliacao;

import org.springframework.stereotype.Service;

/**
 * Módulo de Conciliação Bancária (extratos OFX/CNAB/API vs. liquidações em `/repasses`).
 * Consome valores já apurados pelo motor Node sem duplicar o cálculo de borderô.
 */
@Service
public class ConciliacaoService {
}
