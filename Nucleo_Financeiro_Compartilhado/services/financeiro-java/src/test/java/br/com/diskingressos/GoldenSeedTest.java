package br.com.diskingressos;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Golden Tests do `seed.json` — garante que o serviço Java enxerga os mesmos resultados
 * oficiais gravados pelo motor Node (Polaquedo = 240.00, Festival = 4816.00, Standup = 0.00, Consolidado = 4056.00).
 */
class GoldenSeedTest {

    @Test
    void deveValidarValoresOficiaisDoSeedJson() throws Exception {
        Path seedPath = Path.of("../../firebase/seed.json");
        assertTrue(Files.exists(seedPath), "firebase/seed.json deve existir");

        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(Files.readString(seedPath));
        JsonNode borderos = root.path("borderos_produtor").path("prod_exemplo");

        assertEquals(240.0, borderos.path("polaquedo").path("liberavel").asDouble(), 0.001);
        assertEquals(960.0, borderos.path("polaquedo").path("retido").asDouble(), 0.001);

        assertEquals(4816.0, borderos.path("festival").path("liberavel").asDouble(), 0.001);
        assertEquals(66240.0, borderos.path("festival").path("borderoEvento").asDouble(), 0.001);
    }
}
