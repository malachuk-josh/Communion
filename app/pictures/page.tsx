import { Suspense } from "react";
import PictureGallery from "@/components/PictureGallery";

// The Picture Bible: /pictures for its stories and study sets, ?s=<story> for
// one of them. See components/PictureGallery.
export default function PicturesPage() {
  return (
    <Suspense fallback={null}>
      <PictureGallery />
    </Suspense>
  );
}
