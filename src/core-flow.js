// Flow control elements for lab.js

// Helper function to handle nested elements
let prepare_nested = function(nested, parent) {
  // Setup parent links on nested items
  nested.forEach(c => c.parent = parent)

  // Set ids on nested items
  nested.forEach((c, i) => {
    // For each child, use this element's id
    // and append a counter
    if (parent.id == null) {
      c.id = String(i)
    } else {
      c.id = [parent.id, i].join('_')
    }
  })

  // Pass on specified attributes
  nested.forEach(c => {
    parent.hand_me_downs.forEach(k => {
      c[k] = c[k] || parent[k]
    })
  })

  // Trigger prepare on all nested elements
  nested.forEach(c => c.prepare())
}

// A sequence combines an array of other
// elements and runs them sequentially
export class Sequence extends BaseElement {
  constructor(content, options={}) {
    super(options)

    // Define an array of nested elements to
    // iterate over
    this.content = content;

    // Define a position in the array to begin
    // (note that this is incremented before
    // running the first nested element)
    this.currentPosition = -1;

    // Shuffle items, if so desired
    this.shuffle = options.shuffle || false

    // Use default hand-me-downs
    // unless directed otherwise
    this.hand_me_downs = options.hand_me_downs || hand_me_downs
  }

  prepare() {
    super.prepare()

    // Shuffle content, if requested
    if (this.shuffle) {
      this.content = _.shuffle(this.content)
    }

    prepare_nested(this.content, this)
  }

  run() {
    // Run the sequence by stepping through the
    // content elements
    const promise = super.run()
    this.step()
    return promise
  }

  end(reason) {
    // End prematurely, if necessary
    if (this.currentPosition !== this.content.length) {
      const currentElement = this.content[this.currentPosition]

      // Don't continue stepping through content
      // FIXME: This should only remove
      // the stepper function, but no others
      currentElement.off('after:end')
      currentElement.end('abort by sequence')
    }
    super.end(reason)
  }

  step(increment=+1, keep_going=true) {
    // The step method is unique to sequences,
    // and defines how the next content element
    // is chosen and shown.
    this.triggerMethod('step')

    // Increment the current position
    this.currentPosition += increment

    // If there ist still content yet to be shown,
    // show it while waiting for it to complete,
    // otherwise we are done here.
    if (this.currentPosition !== this.content.length) {
      this.currentElement = this.content[this.currentPosition]

      if (keep_going) {
        // FIXME: Awful function name!
        this.currentElementStepper = () => this.step()
        this.currentElement.once('after:end', this.currentElementStepper)
      }

      this.currentElement.run()
    } else {
      this.currentElement = null
      this.end('complete')
    }
  }
}

// A loop functions exactly like a sequence,
// except that the elements in the loop are
// generated upon initialization from a
// factory function and a data collection.
// Technically, the content is generated by
// mapping the data onto the factory function.
export class Loop extends Sequence {
  constructor(element_factory, data=[], options={}) {
    // Generate the content by applying
    // the element_factory function to each
    // entry in the data array
    content = data.map(element_factory)

    // Otherwise, behave exactly
    // as a sequence would
    super(content, options)
  }
}

// A parallel element executes multiple
// other elements simultaneously
export class Parallel extends BaseElement {
  constructor(content, options={}) {
    super(options)

    // The content, in this case,
    // consists of an array of elements
    // that are run in parallel.
    this.content = content

    // Save options
    this.mode = options.mode || 'race'
    this.hand_me_downs = options.hand_me_downs || hand_me_downs
  }

  prepare() {
    super.prepare()
    prepare_nested(this.content, this)
  }

  run() {
    let promise = super.run()

    // Run all nested elements simultaneously
    this.promises = this.content.map(c => c.run())

    // End this element when all nested elements,
    // or a single element, have ended
    Promise[this.mode](this.promises)
      .then(() => this.end())

    return promise
  }

  end(reason) {
    // Cancel remaining running nested elements
    this.content.forEach(c => {
      if (c.status < status.done)
        c.end('abort by parallel')
    })

    super.end(reason)
  }
}
