import { Suspense } from "react";
import Atlas from "@/components/Atlas";

// Maps: /maps for the atlas — its journeys, places, eras and chapters — and
// ?j=<journey>, ?era=<era>, ?p=<place> or ?b=<book>&c=<chapter> for one map
// of it, full screen. See components/Atlas.
export default function MapsPage() {
  return (
    <Suspense fallback={null}>
      <Atlas />
    </Suspense>
  );
}
