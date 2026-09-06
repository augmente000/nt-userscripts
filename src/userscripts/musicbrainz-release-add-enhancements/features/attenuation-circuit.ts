import { initLabelAutofill } from './label-autofill';

const ATTENUATION_CIRCUIT_MBID = 'd3f44125-8caa-42ff-bcaf-477a9b4a1258';

export function initAttenuationCircuitAutofill(): void {
    initLabelAutofill({
        annotationPattern: /\battenuation\s+circuit\b/iu,
        catalogNumberPattern: /\battenuation\s+circuit\s*[°•]\s*([^°•\r\n]+?)\s*[°•]/iu,
        defaultLabelId: ATTENUATION_CIRCUIT_MBID,
        labels: [{ id: ATTENUATION_CIRCUIT_MBID, names: ['attenuation circuit'] }],
    });
}
