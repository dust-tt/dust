import { classNames } from "../../lib/utils";
import DatasetPicker from "./DatasetPicker";

export default function Config({ app, config, readOnly, onConfigUpdate }) {
  const handleDatasetChange = (name, dataset) => {
    let b = Object.assign({}, config);
    b[name] = Object.assign({}, config[name]);
    b[name].dataset = dataset;
    onConfigUpdate(b);
  };

  return (
    <div>
      <div
        className={classNames(
          "flex flex-col group bg-gray-50 rounded-sm border-2 border-gray-700 px-4 py-2 mb-2"
        )}
      >
        <div className="flex flex-col sm:space-x-2 mx-2">
          <div className="flex flex-row items-center flex-initial -ml-2 mr-2 leading-8">
            <div className="">
              <span className="rounded-md px-1 py-0.5 bg-gray-200 font-medium text-sm">
                run configuration
              </span>
            </div>
          </div>

          {Object.keys(config).map((name) => {
            let c = config[name];
            switch (c.type) {
              case "root":
                return (
                  <div
                    key={name}
                    className="flex flex-row items-center space-x-2 leading-8"
                  >
                    <div className="flex flex-initial items-center mr-2">
                      <span className="font-bold">{name}</span>
                    </div>
                    <DatasetPicker
                      app={app}
                      dataset={c.dataset}
                      onDatasetUpdate={(dataset) =>
                        handleDatasetChange(name, dataset)
                      }
                      readOnly={readOnly}
                    />
                  </div>
                );
                break;
              case "llm":
                return (
                  <div
                    key={name}
                    className="flex sm:flex-row items-center space-x-2 leading-8"
                  >
                    <div className="flex flex-initial items-center">
                      <span className="font-bold">{name}</span>
                    </div>
                    <div className="flex flex-row items-center space-x-2 text-sm font-medium text-gray-700 leading-8">
                      <DatasetPicker
                        app={app}
                        dataset=""
                        onDatasetUpdate={(name) => {}}
                        readOnly={readOnly}
                      />
                    </div>
                    <div className="flex flex-row items-center space-x-2 text-sm font-medium text-gray-700 leading-8">
                      <div className="flex flex-initial">model:</div>
                      <DatasetPicker
                        app={app}
                        dataset=""
                        onDatasetUpdate={(name) => {}}
                        readOnly={readOnly}
                      />
                    </div>
                  </div>
                );
                break;
            }
          })}
        </div>
      </div>
    </div>
  );
}
