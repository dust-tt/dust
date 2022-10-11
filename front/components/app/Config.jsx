import { classNames } from "../../lib/utils";
import DatasetPicker from "./DatasetPicker";
import ModelPicker from "./ModelPicker";

export default function Config({ app, config, readOnly, onConfigUpdate }) {
  const handleDatasetChange = (name, dataset) => {
    let b = Object.assign({}, config);
    b[name] = Object.assign({}, config[name]);
    b[name].dataset = dataset;
    onConfigUpdate(b);
  };

  const handleModelChange = (name, model) => {
    let b = Object.assign({}, config);
    b[name] = Object.assign({}, config[name]);
    b[name].provider_id = model.provider_id;
    b[name].model_id = model.model_id;
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
                    <div className="flex flex-initial items-center mr-2">
                      <span className="font-bold">{name}</span>
                    </div>
                    <ModelPicker
                      app={app}
                      model={{
                        provider_id: c.provider_id,
                        model_id: c.model_id,
                      }}
                      onModelUpdate={(model) => {
                        handleModelChange(name, model);
                      }}
                    />
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
