import Icon, { ICON_NAMES } from "@/components/Icon";

// A contact sheet of the drawn icon set, for checking shapes at reading size.
export default function IconSheet() {
  return (
    <div className="page">
      <h1 className="page-title">Icons</h1>
      <div className="icon-sheet">
        {ICON_NAMES.map((name) => (
          <div key={name} className="icon-cell">
            <span className="icon-big">
              <Icon name={name} />
            </span>
            <span className="icon-small">
              <Icon name={name} />
            </span>
            <code>{name}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
